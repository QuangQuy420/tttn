"""Admin read-only use-cases (plan 15): preference model info and behavior analytics.

Date ranges are calendar days in `Asia/Ho_Chi_Minh`, both ends inclusive: `to` defaults to
today there, `from` to `to` − 29 days, at most `MAX_RANGE_DAYS` days. Every count is
aggregated in SQL by `IInteractionRepository`; this layer zero-fills, orders and enriches.
UNLIKE is not part of the admin analytics (only the 5 funnel types).
"""
import asyncio
import logging
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.core.model_registry import PreferenceModel, get_preference_model
from app.db.models import BehaviorEventType
from app.repositories.interaction_repository import (
    ADMIN_TIMEZONE_NAME,
    IInteractionRepository,
    get_interaction_repository,
)
from app.repositories.product_client import (
    IProductServiceClient,
    get_product_service_client,
)
from app.schemas.admin import (
    AnalyticsSource,
    DailyEventCountsDto,
    DailyEventsDto,
    FunnelDto,
    FunnelEventType,
    FunnelStepDto,
    PreferenceMetricsDto,
    PreferenceModelInfoDto,
    TopProductDto,
    TopProductsDto,
)
from app.schemas.recommend import CatalogProductDto

logger = logging.getLogger(__name__)

ADMIN_TIMEZONE = ZoneInfo(ADMIN_TIMEZONE_NAME)
MAX_RANGE_DAYS = 90
DEFAULT_RANGE_DAYS = 30
# Bound on the top-products catalog enrichment (a cold cache reads every product-service page,
# each up to PRODUCT_SERVICE_TIMEOUT_SECONDS). Must stay well under api-gateway's 5 s
# downstream timeout, so a slow catalog gives null names (200) instead of a gateway 504.
ADMIN_CATALOG_TIMEOUT_SECONDS = 2.0

FUNNEL_EVENT_TYPES: tuple[BehaviorEventType, ...] = (
    BehaviorEventType.VIEW,
    BehaviorEventType.TRY_ON,
    BehaviorEventType.LIKE,
    BehaviorEventType.ADD_TO_CART,
    BehaviorEventType.PURCHASE,
)

# Model card `metrics.test` keys → response fields.
_CARD_METRIC_KEYS = {
    "ndcgAt10": "ndcg@10",
    "hitRateAt10": "hitrate@10",
    "precisionAt10": "precision@10",
    "recallAt10": "recall@10",
}


_INVALID_RANGE_MESSAGE = "Khoảng thời gian không hợp lệ"


class InvalidDateRangeError(Exception):
    """The requested `from`/`to` range is invalid — carries the Vietnamese message."""


class AdminService:
    def __init__(
        self,
        repository: IInteractionRepository,
        product_client: IProductServiceClient,
        settings: Settings,
        preference_model: PreferenceModel | None,
    ) -> None:
        self._repository = repository
        self._product_client = product_client
        self._settings = settings
        self._preference_model = preference_model

    def model_info(self) -> PreferenceModelInfoDto:
        weights = {
            "alpha": self._settings.RANK_ALPHA,
            "beta": self._settings.RANK_BETA,
            "preferenceNorm": self._settings.PREFERENCE_NORM,
        }
        if self._preference_model is None:
            return PreferenceModelInfoDto(
                loaded=False,
                version=None,
                algorithm=None,
                objective=None,
                createdAt=None,
                metrics=None,
                **weights,
            )
        _, card = self._preference_model
        metrics = card.get("metrics")
        test = metrics.get("test") if isinstance(metrics, dict) else None
        return PreferenceModelInfoDto(
            loaded=True,
            version=card.get("version"),
            algorithm=card.get("algorithm"),
            objective=card.get("objective"),
            createdAt=card.get("created_at"),
            metrics=(
                PreferenceMetricsDto(
                    **{
                        field: _metric_mean(test, key)
                        for field, key in _CARD_METRIC_KEYS.items()
                    }
                )
                if isinstance(test, dict)
                else None
            ),
            **weights,
        )

    async def daily_events(
        self, date_from: date | None, date_to: date | None, source: AnalyticsSource
    ) -> DailyEventsDto:
        date_from, date_to = _resolve_range(date_from, date_to)
        start, end = _window(date_from, date_to)
        rows = await self._repository.daily_counts(start, end, source)
        counts: dict[date, dict[FunnelEventType, int]] = {}
        for offset in range((date_to - date_from).days + 1):
            counts[date_from + timedelta(days=offset)] = {
                event_type.value: 0 for event_type in FUNNEL_EVENT_TYPES
            }
        for day, event_type, count in rows:
            if day in counts and event_type in FUNNEL_EVENT_TYPES:
                counts[day][event_type.value] = count
        return DailyEventsDto(
            date_from=date_from,
            date_to=date_to,
            source=source,
            days=[
                DailyEventCountsDto(date=day, counts=day_counts)
                for day, day_counts in counts.items()
            ],
        )

    async def funnel(
        self, date_from: date | None, date_to: date | None, source: AnalyticsSource
    ) -> FunnelDto:
        date_from, date_to = _resolve_range(date_from, date_to)
        start, end = _window(date_from, date_to)
        users_by_type = await self._repository.distinct_users_by_type(start, end, source)
        steps: list[FunnelStepDto] = []
        previous: int | None = None
        for event_type in FUNNEL_EVENT_TYPES:
            users = users_by_type.get(event_type, 0)
            conversion = users / previous if previous else None
            steps.append(
                FunnelStepDto(
                    eventType=event_type.value, users=users, conversionFromPrevious=conversion
                )
            )
            previous = users
        return FunnelDto(date_from=date_from, date_to=date_to, source=source, steps=steps)

    async def top_products(
        self,
        event_type: FunnelEventType,
        date_from: date | None,
        date_to: date | None,
        source: AnalyticsSource,
        limit: int,
    ) -> TopProductsDto:
        date_from, date_to = _resolve_range(date_from, date_to)
        start, end = _window(date_from, date_to)
        rows = await self._repository.top_products(
            BehaviorEventType(event_type), start, end, source, limit
        )
        catalog = await self._catalog_by_id() if rows else {}
        return TopProductsDto(
            date_from=date_from,
            date_to=date_to,
            source=source,
            eventType=event_type,
            items=[_to_top_product(product_id, count, catalog) for product_id, count in rows],
        )

    async def _catalog_by_id(self) -> dict[str, CatalogProductDto]:
        """Published catalog keyed by product id; empty when the catalog cannot be read
        within `ADMIN_CATALOG_TIMEOUT_SECONDS` or fails in any way (names are optional: the
        items are then returned without name/slug/thumbnail). `CancelledError` is not
        caught (BaseException)."""
        try:
            catalog = await asyncio.wait_for(
                self._product_client.list_catalog(), ADMIN_CATALOG_TIMEOUT_SECONDS
            )
        except TimeoutError:
            logger.warning(
                "Top products without catalog data: catalog not read within %ss",
                ADMIN_CATALOG_TIMEOUT_SECONDS,
            )
            return {}
        except Exception as exc:
            # Only the exception type: the message may echo downstream content.
            logger.warning(
                "Top products without catalog data: catalog read failed (%s)",
                type(exc).__name__,
            )
            return {}
        return {product.id: product for product in catalog}


def _resolve_range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    """Apply the defaults and validate — raises `InvalidDateRangeError`."""
    if date_to is None:
        date_to = datetime.now(ADMIN_TIMEZONE).date()
    if date_from is None:
        try:
            date_from = date_to - timedelta(days=DEFAULT_RANGE_DAYS - 1)
        except OverflowError as exc:
            raise InvalidDateRangeError(_INVALID_RANGE_MESSAGE) from exc
    if date_from > date_to:
        raise InvalidDateRangeError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc")
    if (date_to - date_from).days + 1 > MAX_RANGE_DAYS:
        raise InvalidDateRangeError(f"Khoảng thời gian tối đa là {MAX_RANGE_DAYS} ngày")
    return date_from, date_to


def _window(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    """`[start of date_from, start of date_to + 1 day)` in `Asia/Ho_Chi_Minh`, as UTC
    datetimes (same instants). Raises `InvalidDateRangeError` at the edges of the `datetime`
    range (e.g. `to=9999-12-31`, or `from=0001-01-01` whose UTC instant is in year 0)."""
    try:
        start = datetime.combine(date_from, time.min, tzinfo=ADMIN_TIMEZONE)
        end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=ADMIN_TIMEZONE)
        return start.astimezone(UTC), end.astimezone(UTC)
    except OverflowError as exc:
        raise InvalidDateRangeError(_INVALID_RANGE_MESSAGE) from exc


def _metric_mean(test_metrics: dict[str, Any], key: str) -> float | None:
    value = test_metrics.get(key)
    mean = value.get("mean") if isinstance(value, dict) else None
    return float(mean) if isinstance(mean, (int, float)) else None


def _to_top_product(
    product_id: UUID, count: int, catalog: dict[str, CatalogProductDto]
) -> TopProductDto:
    product = catalog.get(str(product_id))
    if product is None:
        return TopProductDto(
            productId=str(product_id), count=count, name=None, slug=None, thumbnailUrl=None
        )
    thumbnail = next((image for image in product.images if image.isThumbnail), None)
    if thumbnail is None and product.images:
        thumbnail = product.images[0]
    return TopProductDto(
        productId=str(product_id),
        count=count,
        name=product.name,
        slug=product.slug,
        thumbnailUrl=thumbnail.imageUrl if thumbnail is not None else None,
    )


def get_admin_service(
    repository: IInteractionRepository = Depends(get_interaction_repository),
    product_client: IProductServiceClient = Depends(get_product_service_client),
    settings: Settings = Depends(get_settings),
) -> AdminService:
    """FastAPI `Depends` provider — request-scoped repository + process-wide client/model."""
    return AdminService(repository, product_client, settings, get_preference_model())
