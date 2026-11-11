"""`interactions` table access — interface + SQLAlchemy async implementation.

The ONLY layer that queries the `interactions` table. The repository never commits: the
caller owns the session/transaction (`get_db_session` for HTTP reads, the consumer's
repository scope for writes — see `app/services/interaction_ingest_service.py`).
"""
import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal, Protocol
from uuid import UUID

from fastapi import Depends
from sqlalchemy import ColumnElement, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BehaviorEventType, Interaction
from app.db.session import get_db_session, get_sessionmaker
from app.schemas.behavior_event import BehaviorEvent

# Admin analytics day buckets (plan 15) — calendar days in Vietnam time.
ADMIN_TIMEZONE_NAME = "Asia/Ho_Chi_Minh"
SIMULATOR_SOURCE = "simulator"
# Admin `source` filter — `real` = every source except the simulator.
AnalyticsSource = Literal["real", "simulator", "all"]


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

    async def list_all_by_user(self, user_id: UUID) -> list[Interaction]:
        """Every interaction of `user_id`, oldest `occurred_at` first (no window — the
        ranker profile uses the full history, like training)."""

    async def list_all_events(
        self, since: datetime
    ) -> list[tuple[UUID, UUID, BehaviorEventType, datetime]]:
        """`(user_id, product_id, event_type, occurred_at)` of every interaction of every
        user at/after `since`, oldest first — the replay input of the global product stats."""

    async def product_totals(self) -> list[tuple[UUID, int, int, datetime]]:
        """`(product_id, n_view, n_purchase, first_event_at)` per product over ALL time;
        `first_event_at` is the earliest event of any type."""

    async def purchased_product_ids(self, user_id: UUID) -> set[UUID]:
        """Products `user_id` has a PURCHASE event for."""

    async def daily_counts(
        self, start: datetime, end: datetime, source: AnalyticsSource
    ) -> list[tuple[date, BehaviorEventType, int]]:
        """Event counts per `Asia/Ho_Chi_Minh` day and event type for `start <= occurred_at
        < end`, ordered by day then type. Days/types with no event are absent."""

    async def distinct_users_by_type(
        self, start: datetime, end: datetime, source: AnalyticsSource
    ) -> dict[BehaviorEventType, int]:
        """Number of distinct users with at least one event of each type in the window.
        Types with no event are absent."""

    async def top_products(
        self,
        event_type: BehaviorEventType,
        start: datetime,
        end: datetime,
        source: AnalyticsSource,
        limit: int,
    ) -> list[tuple[UUID, int]]:
        """`(product_id, count)` of `event_type` events in the window, `count` desc then
        `product_id` asc, capped at `limit` rows."""


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

    async def list_all_by_user(self, user_id: UUID) -> list[Interaction]:
        statement = (
            select(Interaction)
            .where(Interaction.user_id == user_id)
            .order_by(Interaction.occurred_at, Interaction.id)
        )
        result = await self._session.execute(statement)
        return list(result.scalars().all())

    async def list_all_events(
        self, since: datetime
    ) -> list[tuple[UUID, UUID, BehaviorEventType, datetime]]:
        statement = (
            select(
                Interaction.user_id,
                Interaction.product_id,
                Interaction.event_type,
                Interaction.occurred_at,
            )
            .where(Interaction.occurred_at >= since)
            .order_by(Interaction.occurred_at, Interaction.id)
        )
        result = await self._session.execute(statement)
        return [
            (row.user_id, row.product_id, row.event_type, row.occurred_at) for row in result
        ]

    async def product_totals(self) -> list[tuple[UUID, int, int, datetime]]:
        statement = select(
            Interaction.product_id,
            func.count()
            .filter(Interaction.event_type == BehaviorEventType.VIEW)
            .label("n_view"),
            func.count()
            .filter(Interaction.event_type == BehaviorEventType.PURCHASE)
            .label("n_purchase"),
            func.min(Interaction.occurred_at).label("first_event_at"),
        ).group_by(Interaction.product_id)
        result = await self._session.execute(statement)
        return [
            (row.product_id, row.n_view, row.n_purchase, row.first_event_at) for row in result
        ]

    async def purchased_product_ids(self, user_id: UUID) -> set[UUID]:
        statement = (
            select(Interaction.product_id)
            .where(
                Interaction.user_id == user_id,
                Interaction.event_type == BehaviorEventType.PURCHASE,
            )
            .distinct()
        )
        result = await self._session.execute(statement)
        return set(result.scalars().all())

    async def daily_counts(
        self, start: datetime, end: datetime, source: AnalyticsSource
    ) -> list[tuple[date, BehaviorEventType, int]]:
        # `timezone(zone, timestamptz)` → wall-clock time in that zone, independent of the
        # DB session's TimeZone setting.
        day = func.date(func.timezone(ADMIN_TIMEZONE_NAME, Interaction.occurred_at)).label(
            "day"
        )
        statement = (
            select(day, Interaction.event_type, func.count().label("count"))
            .where(*_window_filters(start, end, source))
            .group_by(day, Interaction.event_type)
            .order_by(day, Interaction.event_type)
        )
        result = await self._session.execute(statement)
        return [(row.day, row.event_type, row.count) for row in result]

    async def distinct_users_by_type(
        self, start: datetime, end: datetime, source: AnalyticsSource
    ) -> dict[BehaviorEventType, int]:
        statement = (
            select(
                Interaction.event_type,
                func.count(func.distinct(Interaction.user_id)).label("users"),
            )
            .where(*_window_filters(start, end, source))
            .group_by(Interaction.event_type)
        )
        result = await self._session.execute(statement)
        return {row.event_type: row.users for row in result}

    async def top_products(
        self,
        event_type: BehaviorEventType,
        start: datetime,
        end: datetime,
        source: AnalyticsSource,
        limit: int,
    ) -> list[tuple[UUID, int]]:
        count = func.count().label("count")
        statement = (
            select(Interaction.product_id, count)
            .where(
                Interaction.event_type == event_type,
                *_window_filters(start, end, source),
            )
            .group_by(Interaction.product_id)
            .order_by(count.desc(), Interaction.product_id)
            .limit(limit)
        )
        result = await self._session.execute(statement)
        return [(row.product_id, row.count) for row in result]


def _window_filters(
    start: datetime, end: datetime, source: AnalyticsSource
) -> list[ColumnElement[bool]]:
    """`start <= occurred_at < end` plus the admin `source` filter (`real` = everything
    except the simulator)."""
    filters = [Interaction.occurred_at >= start, Interaction.occurred_at < end]
    if source == "real":
        filters.append(Interaction.source != SIMULATOR_SOURCE)
    elif source == "simulator":
        filters.append(Interaction.source == SIMULATOR_SOURCE)
    return filters


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


async def ping_database(timeout_seconds: float) -> bool:
    """True when `SELECT 1` succeeds within `timeout_seconds` (any error → False)."""
    try:
        async with get_sessionmaker()() as session:
            await asyncio.wait_for(session.execute(text("SELECT 1")), timeout_seconds)
    except Exception:
        return False
    return True
