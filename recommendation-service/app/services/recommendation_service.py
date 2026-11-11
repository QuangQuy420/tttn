"""Recommendation use-cases: `POST /recommend` (face shape + optional user) and
`GET /recommendations/for-you` (one logged-in user).

Both run the hybrid pipeline of `app/services/ranking_service.py` over the WHOLE catalog
(`ProductClient.list_catalog`, cached), not only the products tagged with a face shape:

1. Catalog DTOs → `features.Product` (brand NAME, sorted distinct variant colors — same as
   training `ml/recommendation/src/recsys/catalog.py`).
2. Global `ProductStats`: replay of the last `STATS_WINDOW_DAYS` of interactions in time
   order (popularity) + all-time view/purchase counts and first event date, cached for
   `CATALOG_TTL_SECONDS`. User history: all of the user's interactions, oldest first.
   ORM rows become `features.Event` with `str` ids (catalog keys are `str`).
3. Candidates = catalog minus request filters (`POST /recommend`) or minus purchased
   products (`for-you`). The profile always sees the full catalog.
4. `final = α·preference + β·faceFit` with the effective weights; for-you then applies the
   diversity caps and logs one impression row.

Behavior store (DB) failures: `for-you` raises `BehaviorStoreUnavailableError` (→ 503);
`POST /recommend` degrades to no personalization and popularity 0 (it worked without the
DB before), so the list is ranked by FaceFit only.
"""
import asyncio
import logging
from collections.abc import Callable, Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings, get_settings
from app.core.model_registry import PreferenceModel, get_preference_model
from app.core.ttl_cache import TtlCache
from app.db.models import BehaviorEventType
from app.ml import features as F
from app.ml.face_fit import one_hot
from app.repositories.face_analysis_client import (
    FaceAnalysisSummary,
    IFaceAnalysisClient,
    get_face_analysis_client,
)
from app.repositories.impression_repository import (
    IImpressionRepository,
    impression_repository_scope,
)
from app.repositories.interaction_repository import (
    IInteractionRepository,
    get_interaction_repository,
)
from app.repositories.product_client import (
    IProductServiceClient,
    get_product_service_client,
)
from app.schemas.common import ApiResponse, ok, paginated
from app.schemas.recommend import (
    CatalogProductDto,
    ForYouResponse,
    RecommendedProductDto,
    RecommendRequest,
)
from app.services.ranking_service import (
    FaceInput,
    ScoredProduct,
    diversify,
    effective_weights,
    rank,
)

logger = logging.getLogger(__name__)

# SQLAlchemy errors plus raw connection errors (asyncpg can raise `OSError` on connect).
_DB_ERRORS = (SQLAlchemyError, OSError)

# Card fields copied from a catalog DTO into a `RecommendedProductDto`.
_CARD_FIELDS = set(RecommendedProductDto.model_fields) & set(CatalogProductDto.model_fields)

ImpressionScope = Callable[[], AbstractAsyncContextManager[IImpressionRepository]]

# Shared by every request of this process (the service itself is built per request).
_product_stats_cache: TtlCache[F.ProductStats] = TtlCache()
# Single flight: one rebuild per cache expiry, the other requests wait for its result.
_product_stats_lock = asyncio.Lock()


class BehaviorStoreUnavailableError(Exception):
    """`recommendation_db` (interactions) cannot be read."""


class RecommendationService:
    def __init__(
        self,
        product_client: IProductServiceClient,
        interaction_repository: IInteractionRepository,
        face_analysis_client: IFaceAnalysisClient,
        settings: Settings,
        model: PreferenceModel | None,
        stats_cache: TtlCache[F.ProductStats],
        impression_scope: ImpressionScope,
    ) -> None:
        self._product_client = product_client
        self._interactions = interaction_repository
        self._face_analyses = face_analysis_client
        self._settings = settings
        self._model = model
        self._stats_cache = stats_cache
        self._impression_scope = impression_scope

    async def recommend(
        self, request: RecommendRequest, user_id: UUID | None = None
    ) -> ApiResponse[list[RecommendedProductDto]]:
        dtos, catalog = _to_catalog(await self._product_client.list_catalog())
        candidate_ids = [pid for pid, dto in dtos.items() if _matches_filters(request, dto)]

        try:
            stats = await self._product_stats()
            events = await self._user_events(user_id) if user_id is not None else []
        except _DB_ERRORS as exc:
            logger.warning("Behavior store unavailable, ranking without it: %s", exc)
            stats, events = F.ProductStats(), []

        face = FaceInput(one_hot(request.faceShape), request.faceShape)
        alpha, beta = effective_weights(
            self._settings.RANK_ALPHA, self._settings.RANK_BETA, self._model is not None, True
        )
        # Features + predict for ~100 candidates measured ~9 ms → off the event loop.
        ranked = await run_in_threadpool(
            rank,
            catalog,
            candidate_ids,
            events,
            stats,
            datetime.now(UTC),
            self._model,
            face,
            alpha,
            beta,
            self._settings.PREFERENCE_NORM,
        )

        start = (request.page - 1) * request.limit
        return paginated(
            [_to_dto(dtos[item.product_id], item) for item in ranked[start : start + request.limit]],
            total=len(ranked),
            page=request.page,
            limit=request.limit,
        )

    async def for_you(
        self, user_id: UUID, limit: int, face_analysis_id: UUID | None
    ) -> ApiResponse[ForYouResponse]:
        dtos, catalog = _to_catalog(await self._product_client.list_catalog())

        try:
            stats = await self._product_stats()
            events = await self._user_events(user_id)
            purchased = {str(pid) for pid in await self._interactions.purchased_product_ids(user_id)}
        except _DB_ERRORS as exc:
            raise BehaviorStoreUnavailableError(
                "Không thể đọc dữ liệu hành vi, vui lòng thử lại sau."
            ) from exc

        if face_analysis_id is not None:
            analysis = await self._face_analyses.get_by_id(face_analysis_id, user_id)
        else:
            analysis = await self._face_analyses.get_latest(user_id)
        face = _face_input(analysis)

        alpha, beta = effective_weights(
            self._settings.RANK_ALPHA,
            self._settings.RANK_BETA,
            self._model is not None,
            face is not None,
        )
        candidate_ids = [pid for pid in catalog if pid not in purchased]
        # Features + predict for ~100 candidates measured ~9 ms → off the event loop.
        ranked = await run_in_threadpool(
            rank,
            catalog,
            candidate_ids,
            events,
            stats,
            datetime.now(UTC),
            self._model,
            face,
            alpha,
            beta,
            self._settings.PREFERENCE_NORM,
        )
        top = diversify(
            ranked,
            catalog,
            limit,
            self._settings.MAX_PER_FRAME_SHAPE,
            self._settings.MAX_PER_BRAND,
        )
        model_version = self._model[1].get("version") if self._model is not None else None

        await self._log_impression(user_id, top, alpha, beta, model_version, analysis)
        return ok(
            ForYouResponse(
                items=[_to_dto(dtos[item.product_id], item) for item in top],
                faceShape=analysis.faceShape if analysis is not None else None,
                faceAnalysisId=analysis.analysisId if analysis is not None else None,
                modelVersion=model_version,
                alpha=alpha,
                beta=beta,
            )
        )

    async def _product_stats(self) -> F.ProductStats:
        cached = self._stats_cache.get()
        if cached is not None:
            return cached
        async with _product_stats_lock:
            # Another request may have rebuilt it while this one waited for the lock.
            cached = self._stats_cache.get()
            if cached is not None:
                return cached
            since = datetime.now(UTC) - timedelta(days=self._settings.STATS_WINDOW_DAYS)
            rows = await self._interactions.list_all_events(since)
            totals = await self._interactions.product_totals()
            # The replay is pure CPU (~1 s for 45k events) → off the event loop.
            stats = await run_in_threadpool(_replay_stats, rows, totals)
            self._stats_cache.set(stats, self._settings.CATALOG_TTL_SECONDS)
            return stats

    async def _user_events(self, user_id: UUID) -> list[F.Event]:
        # UNLIKE rows stay in: `build_user_profile` cancels them itself.
        return [
            F.Event(str(row.user_id), str(row.product_id), row.event_type.value, row.occurred_at)
            for row in await self._interactions.list_all_by_user(user_id)
        ]

    async def _log_impression(
        self,
        user_id: UUID,
        items: list[ScoredProduct],
        alpha: float,
        beta: float,
        model_version: str | None,
        analysis: FaceAnalysisSummary | None,
    ) -> None:
        """One `recommendation_impressions` row in its own transaction — a failure is
        logged and never fails the response."""
        try:
            async with self._impression_scope() as repository:
                await repository.add(
                    user_id=user_id,
                    product_ids=[UUID(item.product_id) for item in items],
                    scores={
                        item.product_id: {
                            "preference": item.preference,
                            "faceFit": item.face_fit,
                            "final": item.final,
                        }
                        for item in items
                    },
                    alpha=alpha,
                    beta=beta,
                    model_version=model_version,
                    face_analysis_id=UUID(analysis.analysisId) if analysis is not None else None,
                )
        except Exception:
            logger.exception("Failed to log recommendation impression for user %s", user_id)


def _replay_stats(
    rows: Sequence[tuple[UUID, UUID, BehaviorEventType, datetime]],
    totals: Sequence[tuple[UUID, int, int, datetime]],
) -> F.ProductStats:
    """Global `ProductStats`: popularity from the windowed interactions replayed in time
    order (rows come oldest first, no UNLIKE cancellation, like training), then the
    view/purchase counts and first event date OVERWRITTEN with all-time `totals` (products
    with no event in the window get an entry too)."""
    stats = F.ProductStats()
    for user_id, product_id, event_type, occurred_at in rows:
        stats.add(F.Event(str(user_id), str(product_id), event_type.value, occurred_at))
    for product_id, n_view, n_purchase, first_event_at in totals:
        stats.set_totals(str(product_id), n_view, n_purchase, first_event_at)
    return stats


def _to_catalog(
    products: list[CatalogProductDto],
) -> tuple[dict[str, CatalogProductDto], dict[str, F.Product]]:
    """Catalog DTOs by id + the matching `features.Product`s (same order)."""
    dtos = {dto.id: dto for dto in products}
    catalog = {
        dto.id: F.Product(
            product_id=dto.id,
            brand=dto.brand.name,
            frame_shape=dto.frameShape.value,
            material_type=dto.materialType,
            gender_target=dto.genderTarget.value,
            base_price=float(dto.basePrice),
            colors=tuple(sorted({variant.color for variant in dto.variants if variant.color})),
        )
        for dto in products
    }
    return dtos, catalog


def _matches_filters(request: RecommendRequest, dto: CatalogProductDto) -> bool:
    """`POST /recommend` filters, with product-service's semantics (exact gender, inclusive
    price bounds)."""
    if request.genderTarget is not None and dto.genderTarget != request.genderTarget:
        return False
    if request.minPrice is not None and dto.basePrice < request.minPrice:
        return False
    if request.maxPrice is not None and dto.basePrice > request.maxPrice:
        return False
    return True


def _face_input(analysis: FaceAnalysisSummary | None) -> FaceInput | None:
    if analysis is None:
        return None
    # Analyses created before plan 08 have no probabilities → one-hot of the label.
    probabilities: Mapping = analysis.probabilities or one_hot(analysis.faceShape)
    return FaceInput(probabilities, analysis.faceShape)


def _to_dto(dto: CatalogProductDto, item: ScoredProduct) -> RecommendedProductDto:
    return RecommendedProductDto(
        **{field: getattr(dto, field) for field in _CARD_FIELDS},
        score=item.final,
        preferenceScore=item.preference,
        faceFitScore=item.face_fit,
        finalScore=item.final,
        reasons=list(item.reasons),
    )


def get_recommendation_service(
    product_client: IProductServiceClient = Depends(get_product_service_client),
    interaction_repository: IInteractionRepository = Depends(get_interaction_repository),
    face_analysis_client: IFaceAnalysisClient = Depends(get_face_analysis_client),
    settings: Settings = Depends(get_settings),
) -> RecommendationService:
    """FastAPI `Depends` provider — wires the request-scoped repository with the
    process-wide clients, model and stats cache."""
    return RecommendationService(
        product_client,
        interaction_repository,
        face_analysis_client,
        settings,
        get_preference_model(),
        _product_stats_cache,
        impression_repository_scope,
    )
