"""Persistence for `FaceAnalysis` rows — interface + SQLAlchemy async implementation."""
from typing import Protocol

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FaceAnalysis, FaceShape
from app.db.session import get_db_session


class IFaceAnalysisRepository(Protocol):
    async def create(
        self, s3_key: str, face_shape: FaceShape, measurements: dict, confidence: float
    ) -> FaceAnalysis:
        """Persist one analysis result row and return it (with its generated id)."""


class SqlAlchemyFaceAnalysisRepository:
    """`IFaceAnalysisRepository` implementation backed by an injected `AsyncSession`."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def create(
        self, s3_key: str, face_shape: FaceShape, measurements: dict, confidence: float
    ) -> FaceAnalysis:
        row = FaceAnalysis(
            s3_key=s3_key,
            face_shape=face_shape,
            measurements=measurements,
            confidence=confidence,
        )
        self._session.add(row)
        await self._session.commit()
        await self._session.refresh(row)
        return row


def get_face_analysis_repository(
    session: AsyncSession = Depends(get_db_session),
) -> SqlAlchemyFaceAnalysisRepository:
    """FastAPI `Depends` provider — one repository per request, bound to that request's session."""
    return SqlAlchemyFaceAnalysisRepository(session)
