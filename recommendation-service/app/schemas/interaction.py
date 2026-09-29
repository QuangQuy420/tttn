"""Pydantic response DTOs for the `/internal/*` endpoints (wrapped in `ApiResponse[T]`).

camelCase field names, same as the event contract and the other envelopes.
"""
import datetime as dt
from typing import Any
from uuid import UUID

from pydantic import BaseModel

from app.db.models import BehaviorEventType


class InteractionDto(BaseModel):
    eventId: UUID
    eventType: BehaviorEventType
    productId: UUID
    occurredAt: dt.datetime
    source: str
    context: dict[str, Any]


class InteractionListDto(BaseModel):
    items: list[InteractionDto]


class EventCountDto(BaseModel):
    # `occurred_at` day in UTC.
    date: dt.date
    eventType: BehaviorEventType
    count: int


class EventStatsDto(BaseModel):
    days: int
    items: list[EventCountDto]
