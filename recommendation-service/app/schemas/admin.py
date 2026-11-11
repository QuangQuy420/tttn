"""Pydantic response DTOs for the `/admin/*` endpoints (wrapped in `ApiResponse[T]`).

camelCase field names written directly, like the other DTOs. `from` is a Python keyword, so
the range fields are `date_from` / `date_to` serialized as `from` / `to` (FastAPI serializes
`response_model` by alias).
"""
import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

# Re-exported: the `source` filter Literal lives with the repository that applies it.
from app.repositories.interaction_repository import AnalyticsSource
# The 5 funnel event types (no UNLIKE) — `eventType` query values of the admin analytics.
FunnelEventType = Literal["VIEW", "TRY_ON", "LIKE", "ADD_TO_CART", "PURCHASE"]


class PreferenceMetricsDto(BaseModel):
    ndcgAt10: float | None
    hitRateAt10: float | None
    precisionAt10: float | None
    recallAt10: float | None


class PreferenceModelInfoDto(BaseModel):
    """`loaded=false` (legacy mode) → the model fields are null; the configured weights are
    always set."""

    loaded: bool
    version: str | None
    algorithm: str | None
    objective: str | None
    createdAt: str | None
    metrics: PreferenceMetricsDto | None
    alpha: float
    beta: float
    preferenceNorm: str


class AnalyticsRangeDto(BaseModel):
    date_from: dt.date = Field(serialization_alias="from")
    date_to: dt.date = Field(serialization_alias="to")
    source: AnalyticsSource


class DailyEventCountsDto(BaseModel):
    date: dt.date
    # One key per funnel event type, zeros filled.
    counts: dict[FunnelEventType, int]


class DailyEventsDto(AnalyticsRangeDto):
    days: list[DailyEventCountsDto]


class FunnelStepDto(BaseModel):
    eventType: FunnelEventType
    users: int
    # `users / users of the previous step`; null for the first step or a previous step of 0.
    conversionFromPrevious: float | None


class FunnelDto(AnalyticsRangeDto):
    steps: list[FunnelStepDto]


class TopProductDto(BaseModel):
    productId: str
    count: int
    # null when the product is not in the published catalog or the catalog is unavailable.
    name: str | None
    slug: str | None
    thumbnailUrl: str | None


class TopProductsDto(AnalyticsRangeDto):
    eventType: FunnelEventType
    items: list[TopProductDto]
