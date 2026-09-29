"""`/internal/*` — service-to-service reads of the behavior event store.

Every route requires `X-Internal-Key` (`require_internal_key`, 403 otherwise). Thin: reads
through `IInteractionRepository` and maps rows to DTOs. Query/path validation errors
(bad `userId`, out-of-range `limit`/`days`, naive `since`) become 400 `VALIDATION_FAILED`
via the handler in `app/main.py`.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import AwareDatetime

from app.core.internal_auth import require_internal_key
from app.repositories.interaction_repository import (
    IInteractionRepository,
    get_interaction_repository,
)
from app.schemas.common import ApiResponse, ok
from app.schemas.interaction import (
    EventCountDto,
    EventStatsDto,
    InteractionDto,
    InteractionListDto,
)

router = APIRouter(prefix="/internal", dependencies=[Depends(require_internal_key)])


@router.get(
    "/users/{user_id}/interactions",
    response_model=ApiResponse[InteractionListDto],
)
async def list_user_interactions(
    user_id: UUID,
    # Send the offset as `Z` or `%2B07:00` — a raw `+` in a query string decodes to a space.
    since: AwareDatetime | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    repository: IInteractionRepository = Depends(get_interaction_repository),
) -> ApiResponse[InteractionListDto]:
    rows = await repository.list_by_user(user_id, since, limit)
    items = [
        InteractionDto(
            eventId=row.event_id,
            eventType=row.event_type,
            productId=row.product_id,
            occurredAt=row.occurred_at,
            source=row.source,
            context=row.context,
        )
        for row in rows
    ]
    return ok(InteractionListDto(items=items))


@router.get("/stats/events", response_model=ApiResponse[EventStatsDto])
async def event_stats(
    days: int = Query(default=7, ge=1, le=90),
    repository: IInteractionRepository = Depends(get_interaction_repository),
) -> ApiResponse[EventStatsDto]:
    rows = await repository.count_events_by_day(days)
    items = [
        EventCountDto(date=day, eventType=event_type, count=count)
        for day, event_type, count in rows
    ]
    return ok(EventStatsDto(days=days, items=items))
