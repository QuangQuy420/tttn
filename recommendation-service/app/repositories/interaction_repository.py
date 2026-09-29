"""`interactions` table access — interface + SQLAlchemy async implementation.

The ONLY layer that queries `recommendation_db`. The repository never commits: the
caller owns the session/transaction (`get_db_session` for HTTP reads, the consumer's
repository scope for writes — see `app/services/interaction_ingest_service.py`).
"""
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, time, timedelta
from typing import Protocol
from uuid import UUID

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BehaviorEventType, Interaction
from app.db.session import get_db_session, get_sessionmaker
from app.schemas.behavior_event import BehaviorEvent


class IInteractionRepository(Protocol):
    async def insert_if_absent(self, event: BehaviorEvent) -> bool:
        """Store `event` unless a row with the same `eventId` exists. Returns True if a
        new row was inserted, False if it was a duplicate."""

    async def list_by_user(
        self, user_id: UUID, since: datetime | None, limit: int
    ) -> list[Interaction]:
        """Latest interactions of `user_id` (newest `occurred_at` first), optionally only
        those at/after `since`, capped at `limit` rows."""

    async def count_events_by_day(
        self, days: int
    ) -> list[tuple[date, BehaviorEventType, int]]:
        """Event counts per UTC day and event type over the last `days` UTC days
        (today included), ordered by day then type."""


class SqlAlchemyInteractionRepository:
    """`AsyncSession`-backed `IInteractionRepository`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert_if_absent(self, event: BehaviorEvent) -> bool:
        statement = (
            insert(Interaction)
            .values(
                event_id=event.eventId,
                user_id=event.userId,
                product_id=event.productId,
                event_type=event.eventType,
                occurred_at=event.occurredAt,
                source=event.source,
                context=event.context.model_dump(mode="json", exclude_none=True),
            )
            .on_conflict_do_nothing(index_elements=[Interaction.event_id])
            .returning(Interaction.id)
        )
        result = await self._session.execute(statement)
        # ON CONFLICT DO NOTHING returns no row when the eventId already exists.
        return result.scalar_one_or_none() is not None

    async def list_by_user(
        self, user_id: UUID, since: datetime | None, limit: int
    ) -> list[Interaction]:
        statement = select(Interaction).where(Interaction.user_id == user_id)
        if since is not None:
            statement = statement.where(Interaction.occurred_at >= since)
        statement = statement.order_by(Interaction.occurred_at.desc()).limit(limit)
        result = await self._session.execute(statement)
        return list(result.scalars().all())

    async def count_events_by_day(
        self, days: int
    ) -> list[tuple[date, BehaviorEventType, int]]:
        window_start = datetime.combine(
            datetime.now(UTC).date() - timedelta(days=days - 1), time.min, tzinfo=UTC
        )
        # `timezone('UTC', timestamptz)` → UTC wall-clock time, so the day bucket is the
        # UTC date regardless of the DB session's TimeZone setting.
        day = func.date(func.timezone("UTC", Interaction.occurred_at)).label("day")
        statement = (
            select(day, Interaction.event_type, func.count().label("count"))
            .where(Interaction.occurred_at >= window_start)
            .group_by(day, Interaction.event_type)
            .order_by(day, Interaction.event_type)
        )
        result = await self._session.execute(statement)
        return [(row.day, row.event_type, row.count) for row in result]


def get_interaction_repository(
    session: AsyncSession = Depends(get_db_session),
) -> IInteractionRepository:
    """FastAPI `Depends` provider — one repository per request-scoped session."""
    return SqlAlchemyInteractionRepository(session)


@asynccontextmanager
async def interaction_repository_scope() -> AsyncIterator[IInteractionRepository]:
    """Unit of work for the consumer: one session per message, committed on success and
    rolled back (by the session context) if the body raises."""
    async with get_sessionmaker()() as session:
        yield SqlAlchemyInteractionRepository(session)
        await session.commit()
