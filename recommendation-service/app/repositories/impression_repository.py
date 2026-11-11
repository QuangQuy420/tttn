"""`recommendation_impressions` table access — interface + SQLAlchemy async implementation.

The repository never commits; `impression_repository_scope` is its own unit of work
(the request session of `GET /recommendations/for-you` never commits).
"""
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Protocol
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RecommendationImpression
from app.db.session import get_sessionmaker


class IImpressionRepository(Protocol):
    async def add(
        self,
        user_id: UUID,
        product_ids: list[UUID],
        scores: dict[str, dict[str, float]],
        alpha: float,
        beta: float,
        model_version: str | None,
        face_analysis_id: UUID | None,
    ) -> None:
        """Stage one impression row (ranked `product_ids`, per-product scores)."""


class SqlAlchemyImpressionRepository:
    """`AsyncSession`-backed `IImpressionRepository`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(
        self,
        user_id: UUID,
        product_ids: list[UUID],
        scores: dict[str, dict[str, float]],
        alpha: float,
        beta: float,
        model_version: str | None,
        face_analysis_id: UUID | None,
    ) -> None:
        self._session.add(
            RecommendationImpression(
                user_id=user_id,
                product_ids=product_ids,
                scores=scores,
                alpha=alpha,
                beta=beta,
                model_version=model_version,
                face_analysis_id=face_analysis_id,
            )
        )


@asynccontextmanager
async def impression_repository_scope() -> AsyncIterator[IImpressionRepository]:
    """One session per impression, committed on success and rolled back (by the session
    context) if the body raises."""
    async with get_sessionmaker()() as session:
        yield SqlAlchemyImpressionRepository(session)
        await session.commit()
