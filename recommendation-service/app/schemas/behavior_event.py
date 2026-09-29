"""Pydantic model of one `behavior-events` message body (see
`infra/contracts/behavior-events.md`).

Field names are camelCase on purpose — they match the JSON payload producers publish, so
the consumer validates the raw body directly with `BehaviorEvent.model_validate_json`.
Any validation failure here means the message is malformed and is dead-lettered, never
retried (see `app/services/interaction_ingest_service.py`).
"""
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.db.models import BehaviorEventType
from app.schemas.recommend import FaceShape


class BehaviorEventContext(BaseModel):
    """Optional per-event details — unknown keys are ignored, not stored."""

    model_config = ConfigDict(extra="ignore")

    variantId: UUID | None = None
    quantity: int | None = Field(default=None, ge=1)
    orderId: UUID | None = None
    sessionId: str | None = Field(default=None, max_length=64)
    durationMs: int | None = Field(default=None, ge=0)
    faceShape: FaceShape | None = None


class BehaviorEvent(BaseModel):
    eventId: UUID
    eventType: BehaviorEventType
    userId: UUID
    productId: UUID
    # Must carry a timezone offset — a naive timestamp is rejected as malformed.
    occurredAt: AwareDatetime
    source: Literal["web", "product-service", "order-service", "simulator"]
    context: BehaviorEventContext = Field(default_factory=BehaviorEventContext)
