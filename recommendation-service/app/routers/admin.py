"""`/admin/*` — read-only admin views (plan 15): preference model info and behavior analytics.

Every route requires `X-Internal-Key` (`require_internal_key`, 403 otherwise); api-gateway
enforces the admin JWT + permission in front. Thin: delegates to `AdminService` and maps
`InvalidDateRangeError` to 400. Malformed dates, an unknown `source`/`eventType` (UNLIKE
included) or an out-of-range `limit` become 400 `VALIDATION_FAILED` via `app/main.py`.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.internal_auth import require_internal_key
from app.schemas.admin import (
    AnalyticsSource,
    DailyEventsDto,
    FunnelDto,
    FunnelEventType,
    PreferenceModelInfoDto,
    TopProductsDto,
)
from app.schemas.common import ApiResponse, ok
from app.services.admin_service import (
    AdminService,
    InvalidDateRangeError,
    get_admin_service,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(require_internal_key)])


def _bad_range(exc: InvalidDateRangeError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/model-info", response_model=ApiResponse[PreferenceModelInfoDto])
async def model_info(
    service: AdminService = Depends(get_admin_service),
) -> ApiResponse[PreferenceModelInfoDto]:
    return ok(service.model_info())


@router.get("/analytics/events/daily", response_model=ApiResponse[DailyEventsDto])
async def daily_events(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    source: AnalyticsSource = Query(default="real"),
    service: AdminService = Depends(get_admin_service),
) -> ApiResponse[DailyEventsDto]:
    try:
        return ok(await service.daily_events(date_from, date_to, source))
    except InvalidDateRangeError as exc:
        raise _bad_range(exc) from exc


@router.get("/analytics/funnel", response_model=ApiResponse[FunnelDto])
async def funnel(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    source: AnalyticsSource = Query(default="real"),
    service: AdminService = Depends(get_admin_service),
) -> ApiResponse[FunnelDto]:
    try:
        return ok(await service.funnel(date_from, date_to, source))
    except InvalidDateRangeError as exc:
        raise _bad_range(exc) from exc


@router.get("/analytics/top-products", response_model=ApiResponse[TopProductsDto])
async def top_products(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    source: AnalyticsSource = Query(default="real"),
    event_type: FunnelEventType = Query(default="VIEW", alias="eventType"),
    limit: int = Query(default=10, ge=1, le=50),
    service: AdminService = Depends(get_admin_service),
) -> ApiResponse[TopProductsDto]:
    try:
        return ok(await service.top_products(event_type, date_from, date_to, source, limit))
    except InvalidDateRangeError as exc:
        raise _bad_range(exc) from exc
