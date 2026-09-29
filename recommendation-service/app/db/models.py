"""ORM models — SQLAlchemy 2.0 declarative style.

`Interaction` is the behavior event store: one row per consumed `behavior-events`
message (see `infra/contracts/behavior-events.md`). `event_id` is UNIQUE so a redelivered
or re-published event is stored only once (consumer-side dedupe). `user_id` /
`product_id` are plain UUIDs — `recommendation_db` has no cross-database foreign keys to
user/product data (database-per-service).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, Identity, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class BehaviorEventType(str, enum.Enum):
    VIEW = "VIEW"
    TRY_ON = "TRY_ON"
    LIKE = "LIKE"
    UNLIKE = "UNLIKE"
    ADD_TO_CART = "ADD_TO_CART"
    PURCHASE = "PURCHASE"


class Interaction(Base):
    __tablename__ = "interactions"
    __table_args__ = (
        # "latest history of one user" (`GET /internal/users/{userId}/interactions`).
        Index("ix_interactions_user_occurred", "user_id", text("occurred_at DESC")),
        Index("ix_interactions_product", "product_id"),
        # Per-day / per-type analytics (`GET /internal/stats/events`, plan 15).
        Index("ix_interactions_occurred_type", "occurred_at", "event_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, unique=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_type: Mapped[BehaviorEventType] = mapped_column(
        Enum(BehaviorEventType, name="behavior_event_type_enum"), nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    context: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
