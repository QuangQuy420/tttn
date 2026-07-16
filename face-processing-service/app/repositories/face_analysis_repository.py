"""Persistence for `FaceAnalysis` rows — interface + SQLAlchemy async implementation."""
import uuid
from typing import Protocol

from fastapi import Depends
from sqlalchemy import select
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
    ) -> FaceAnalysis:
        """Persist one analysis result row and return it (with its generated id)."""

    async def list_by_user(self, user_id: uuid.UUID) -> list[FaceAnalysis]:
        """Return `user_id`'s analysis rows, newest first."""


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
    ) -> FaceAnalysis:
        row = FaceAnalysis(
            user_id=user_id,
            s3_key=s3_key,
            face_shape=face_shape,
            measurements=measurements,
            confidence=confidence,
        )
        self._session.add(row)
        await self._session.commit()
        await self._session.refresh(row)
        return row

    async def list_by_user(self, user_id: uuid.UUID) -> list[FaceAnalysis]:
        result = await self._session.execute(
            select(FaceAnalysis)
            .where(FaceAnalysis.user_id == user_id)
            .order_by(FaceAnalysis.created_at.desc())
        )
        return list(result.scalars().all())


def get_face_analysis_repository(
    session: AsyncSession = Depends(get_db_session),
) -> SqlAlchemyFaceAnalysisRepository:
    """FastAPI `Depends` provider — one repository per request, bound to that request's session."""
    return SqlAlchemyFaceAnalysisRepository(session)
