"""Persistence for `FaceAnalysis` rows — interface + SQLAlchemy async implementation."""
import uuid
from typing import Protocol

from fastapi import Depends
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FaceAnalysis, FaceShape
from app.db.session import get_db_session


class IFaceAnalysisRepository(Protocol):
    async def create(
        self,
        user_id: uuid.UUID,
        s3_key: str,
        face_shape: FaceShape,
        measurements: dict,
        confidence: float,
        model_version: str | None = None,
        method: str | None = None,
        probabilities: dict | None = None,
    ) -> FaceAnalysis:
        """Persist one analysis result row and return it (with its generated id)."""

    async def list_by_user(
        self, user_id: uuid.UUID, offset: int, limit: int
    ) -> list[FaceAnalysis]:
        """Return one page of `user_id`'s analysis rows, newest first."""

    async def count_by_user(self, user_id: uuid.UUID) -> int:
        """Return how many analysis rows `user_id` has in total."""

    async def get_by_id(self, id: uuid.UUID) -> FaceAnalysis | None:
        """Return the row with this id, or `None` if it doesn't exist."""

    async def get_latest_by_user(self, user_id: uuid.UUID) -> FaceAnalysis | None:
        """Return `user_id`'s newest analysis row, or `None` if they have none."""

    async def delete(self, id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """Delete the row with this id, scoped to `user_id`. Returns whether a row was
        actually deleted — defense-in-depth: this method must not delete a row it
        wasn't given the owner for, even though callers are expected to check
        ownership themselves first."""


class SqlAlchemyFaceAnalysisRepository:
    """`IFaceAnalysisRepository` implementation backed by an injected `AsyncSession`."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def create(
        self,
        user_id: uuid.UUID,
        s3_key: str,
        face_shape: FaceShape,
        measurements: dict,
        confidence: float,
        model_version: str | None = None,
        method: str | None = None,
        probabilities: dict | None = None,
    ) -> FaceAnalysis:
        row = FaceAnalysis(
            user_id=user_id,
            s3_key=s3_key,
            face_shape=face_shape,
            measurements=measurements,
            confidence=confidence,
            model_version=model_version,
            method=method,
            probabilities=probabilities,
        )
        self._session.add(row)
        await self._session.commit()
        await self._session.refresh(row)
        return row

    async def list_by_user(
        self, user_id: uuid.UUID, offset: int, limit: int
    ) -> list[FaceAnalysis]:
        result = await self._session.execute(
            select(FaceAnalysis)
            .where(FaceAnalysis.user_id == user_id)
            .order_by(FaceAnalysis.created_at.desc(), FaceAnalysis.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_by_user(self, user_id: uuid.UUID) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(FaceAnalysis)
            .where(FaceAnalysis.user_id == user_id)
        )
        return result.scalar_one()

    async def get_by_id(self, id: uuid.UUID) -> FaceAnalysis | None:
        result = await self._session.execute(
            select(FaceAnalysis).where(FaceAnalysis.id == id)
        )
        return result.scalar_one_or_none()

    async def get_latest_by_user(self, user_id: uuid.UUID) -> FaceAnalysis | None:
        result = await self._session.execute(
            select(FaceAnalysis)
            .where(FaceAnalysis.user_id == user_id)
            .order_by(FaceAnalysis.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def delete(self, id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self._session.execute(
            delete(FaceAnalysis).where(
                FaceAnalysis.id == id, FaceAnalysis.user_id == user_id
            )
        )
        await self._session.commit()
        return result.rowcount > 0


def get_face_analysis_repository(
    session: AsyncSession = Depends(get_db_session),
) -> SqlAlchemyFaceAnalysisRepository:
    """FastAPI `Depends` provider — one repository per request, bound to that request's session."""
    return SqlAlchemyFaceAnalysisRepository(session)
