"""Unit tests for `RecommendationService` — `recommend` (legacy `POST /recommend`) and
`for_you` over the hybrid ranking pipeline (plan 11, T7/T10).

Every boundary is a small fake: product client (`list_catalog`), interaction repository,
face-analysis client, impression scope, and a tiny `xgboost.Booster`-like model. No
network, no DB, no committed model.
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID

import numpy as np
import pytest
from sqlalchemy.exc import OperationalError

from app.core.config import Settings
from app.core.ttl_cache import TtlCache
from app.db.models import BehaviorEventType
from app.ml.face_fit import face_fit
from app.repositories.face_analysis_client import FaceAnalysisSummary
from app.schemas.recommend import (
    BrandSummaryDto,
    CatalogProductDto,
    CatalogVariantDto,
    FaceShape,
    RecommendRequest,
)
from app.services.recommendation_service import (
    BehaviorStoreUnavailableError,
    RecommendationService,
)

USER = UUID("11111111-1111-1111-1111-111111111111")
ANALYSIS = UUID("22222222-2222-2222-2222-222222222222")
P_SQUARE = "00000000-0000-0000-0000-00000000000a"
P_CAT_EYE = "00000000-0000-0000-0000-00000000000b"
P_RECT = "00000000-0000-0000-0000-00000000000c"
P_ROUND = "00000000-0000-0000-0000-00000000000d"

_SETTINGS = Settings(
    RANK_ALPHA=0.6,
    RANK_BETA=0.4,
    # Pinned to the legacy scale so the asserts below keep testing the calibrated
    # preferences (plan 12); `rank` mode has its own test.
    PREFERENCE_NORM="none",
    PREFERENCE_MODEL_VERSION="",
    CATALOG_TTL_SECONDS=300,
    MAX_PER_FRAME_SHAPE=3,
    MAX_PER_BRAND=3,
)
_CARD = {
    "version": "v-test",
    "price_band_edges": [900_000.0, 1_800_000.0, 4_200_000.0],
    "calibration": {"method": "sigmoid", "raw_score": "margin", "a": 1.0, "b": 0.0},
}


class _ZeroBooster:
    """`xgboost.Booster`-like: margin 0 for every row → preference 0.5."""

    def inplace_predict(self, X: np.ndarray, predict_type: str = "value") -> np.ndarray:
        return np.zeros(X.shape[0])


class _RowIndexBooster:
    """`xgboost.Booster`-like: margin = row index (candidate order) → distinct preferences."""

    def inplace_predict(self, X: np.ndarray, predict_type: str = "value") -> np.ndarray:
        return np.arange(X.shape[0], dtype=np.float64)


def _product(pid: str, frame_shape: str, face_shapes: list[FaceShape] | None = None) -> CatalogProductDto:
    return CatalogProductDto(
        id=pid,
        sku=f"SKU-{pid[-1]}",
        name=f"Product {pid[-1]}",
        slug=f"product-{pid[-1]}",
        frameShape=frame_shape,
        genderTarget="UNISEX",
        materialType="ACETATE",
        basePrice=1_000_000.0,
        brand=BrandSummaryDto(id=f"brand-{pid[-1]}", name=f"Brand {pid[-1]}", logoUrl=None),
        images=[],
        faceShapes=face_shapes or [],
        variants=[CatalogVariantDto(color="black")],
    )


_CATALOG = [
    _product(P_SQUARE, "SQUARE"),  # not tagged with any face shape (AC11)
    _product(P_CAT_EYE, "CAT_EYE", [FaceShape.ROUND]),
    _product(P_RECT, "RECTANGLE", [FaceShape.ROUND]),
    _product(P_ROUND, "ROUND", [FaceShape.SQUARE]),
]


class FakeProductClient:
    def __init__(self, products: list[CatalogProductDto]):
        self._products = products

    async def list_catalog(self) -> list[CatalogProductDto]:
        return self._products


class FakeInteractionRepository:
    """`(user_id, product_id, event_type, occurred_at)` rows; `error` makes every read fail."""

    def __init__(self, rows=(), error: Exception | None = None):
        self._rows = list(rows)
        self._error = error
        self.history_calls: list[UUID] = []

    def _check(self) -> None:
        if self._error is not None:
            raise self._error

    async def list_all_events(self):
        self._check()
        return self._rows

    async def list_all_by_user(self, user_id: UUID):
        self._check()
        self.history_calls.append(user_id)
        return [
            SimpleNamespace(user_id=u, product_id=p, event_type=t, occurred_at=at)
            for u, p, t, at in self._rows
            if u == user_id
        ]

    async def purchased_product_ids(self, user_id: UUID) -> set[UUID]:
        self._check()
        return {p for u, p, t, _ in self._rows if u == user_id and t == BehaviorEventType.PURCHASE}


class FakeFaceAnalysisClient:
    def __init__(self, analysis: FaceAnalysisSummary | None = None):
        self._analysis = analysis
        self.calls: list[tuple] = []

    async def get_latest(self, user_id: UUID):
        self.calls.append(("latest", user_id))
        return self._analysis

    async def get_by_id(self, analysis_id: UUID, user_id: UUID):
        self.calls.append(("by_id", analysis_id, user_id))
        return self._analysis


class ImpressionRecorder:
    def __init__(self):
        self.rows: list[dict] = []

    @asynccontextmanager
    async def scope(self):
        yield self

    async def add(self, **row) -> None:
        self.rows.append(row)


def _service(
    interactions: FakeInteractionRepository | None = None,
    face_client: FakeFaceAnalysisClient | None = None,
    model=None,
    impressions: ImpressionRecorder | None = None,
    settings: Settings = _SETTINGS,
) -> RecommendationService:
    return RecommendationService(
        FakeProductClient(_CATALOG),
        interactions or FakeInteractionRepository(),
        face_client or FakeFaceAnalysisClient(),
        settings,
        model,
        TtlCache(),
        (impressions or ImpressionRecorder()).scope,
    )


def _purchase_and_view_rows() -> list[tuple]:
    at = datetime.now(UTC) - timedelta(days=1)
    return [
        (USER, UUID(P_ROUND), BehaviorEventType.VIEW, at),
        (USER, UUID(P_ROUND), BehaviorEventType.PURCHASE, at + timedelta(minutes=1)),
    ]


def test_recommend_ranks_the_whole_catalog_and_keeps_the_paginated_envelope_AC10_AC11() -> None:
    # Legacy mode (no model) + anonymous: α=0, ranked by FaceFit of the one-hot ROUND face.
    interactions = FakeInteractionRepository()
    service = _service(interactions=interactions)

    response = asyncio.run(
        service.recommend(RecommendRequest(faceShape=FaceShape.ROUND, page=1, limit=2))
    )

    # SQUARE (10/10) is not tagged ROUND but is still a candidate (AC11).
    assert [item.id for item in response.data] == [P_SQUARE, P_RECT]
    assert response.meta.model_dump() == {"page": 1, "limit": 2, "total": 4, "totalPages": 2}
    top = response.data[0]
    assert top.score == top.finalScore == pytest.approx(0.4 * 1.0)  # score = finalScore, 0–1 (AC10)
    assert top.faceFitScore == pytest.approx(1.0)
    assert top.preferenceScore == 0.0
    assert interactions.history_calls == []  # anonymous → no user history read


def test_for_you_excludes_purchases_reports_weights_and_logs_one_impression_AC4_AC7_AC8_AC15() -> None:
    probs = {FaceShape.ROUND: 0.7, FaceShape.OVAL: 0.3}
    face_client = FakeFaceAnalysisClient(
        FaceAnalysisSummary(analysisId=str(ANALYSIS), faceShape=FaceShape.ROUND, probabilities=probs)
    )
    impressions = ImpressionRecorder()
    service = _service(
        interactions=FakeInteractionRepository(_purchase_and_view_rows()),
        face_client=face_client,
        model=(_ZeroBooster(), _CARD),
        impressions=impressions,
    )

    response = asyncio.run(service.for_you(USER, limit=10, face_analysis_id=ANALYSIS))

    data = response.data
    ids = [item.id for item in data.items]
    assert P_ROUND not in ids  # purchased (AC8)
    assert sorted(ids) == sorted([P_SQUARE, P_CAT_EYE, P_RECT])
    assert (data.alpha, data.beta) == (0.6, 0.4)  # defaults from settings (AC4)
    assert (data.faceShape, data.faceAnalysisId, data.modelVersion) == (
        FaceShape.ROUND,
        str(ANALYSIS),
        "v-test",
    )
    assert face_client.calls == [("by_id", ANALYSIS, USER)]
    for item in data.items:
        assert item.preferenceScore == pytest.approx(0.5)
        assert item.faceFitScore == pytest.approx(face_fit(probs, item.frameShape))  # AC7
        assert item.finalScore == pytest.approx(0.6 * 0.5 + 0.4 * item.faceFitScore)

    assert impressions.rows == [
        {
            "user_id": USER,
            "product_ids": [UUID(pid) for pid in ids],
            "scores": {
                item.id: {
                    "preference": item.preferenceScore,
                    "faceFit": item.faceFitScore,
                    "final": item.finalScore,
                }
                for item in data.items
            },
            "alpha": 0.6,
            "beta": 0.4,
            "model_version": "v-test",
            "face_analysis_id": ANALYSIS,
        }
    ]


def test_for_you_without_a_face_analysis_uses_beta_zero_AC5() -> None:
    face_client = FakeFaceAnalysisClient(None)
    service = _service(
        interactions=FakeInteractionRepository(_purchase_and_view_rows()),
        face_client=face_client,
        model=(_ZeroBooster(), _CARD),
    )

    response = asyncio.run(service.for_you(USER, limit=10, face_analysis_id=None))

    data = response.data
    assert (data.alpha, data.beta) == (0.6, 0.0)
    assert data.faceShape is None and data.faceAnalysisId is None
    assert face_client.calls == [("latest", USER)]
    assert all(item.faceFitScore == 0.0 for item in data.items)
    assert all(item.finalScore == pytest.approx(0.6 * item.preferenceScore) for item in data.items)


def test_for_you_raises_behavior_store_unavailable_when_the_db_fails() -> None:
    service = _service(
        interactions=FakeInteractionRepository(error=OperationalError("SELECT 1", {}, Exception("down")))
    )

    with pytest.raises(BehaviorStoreUnavailableError):
        asyncio.run(service.for_you(USER, limit=10, face_analysis_id=None))


def test_settings_default_to_rank_norm_with_alpha_0_6_beta_0_4_AC13(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("PREFERENCE_NORM", "RANK_ALPHA", "RANK_BETA"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)

    assert (settings.PREFERENCE_NORM, settings.RANK_ALPHA, settings.RANK_BETA) == ("rank", 0.6, 0.4)


def test_for_you_passes_the_rank_preference_norm_to_the_ranking_AC12() -> None:
    probs = {FaceShape.ROUND: 0.7, FaceShape.OVAL: 0.3}
    face_client = FakeFaceAnalysisClient(
        FaceAnalysisSummary(analysisId=str(ANALYSIS), faceShape=FaceShape.ROUND, probabilities=probs)
    )
    service = _service(
        interactions=FakeInteractionRepository(_purchase_and_view_rows()),
        face_client=face_client,
        model=(_RowIndexBooster(), _CARD),
        settings=_SETTINGS.model_copy(update={"PREFERENCE_NORM": "rank"}),
    )

    response = asyncio.run(service.for_you(USER, limit=10, face_analysis_id=ANALYSIS))

    # Candidates (catalog order minus the purchase) get margins 0, 1, 2 → ranks 0, 0.5, 1.
    items = {item.id: item for item in response.data.items}
    assert {pid: item.preferenceScore for pid, item in items.items()} == pytest.approx(
        {P_SQUARE: 0.0, P_CAT_EYE: 0.5, P_RECT: 1.0}
    )
    for item in items.values():
        assert item.finalScore == pytest.approx(0.6 * item.preferenceScore + 0.4 * item.faceFitScore)
