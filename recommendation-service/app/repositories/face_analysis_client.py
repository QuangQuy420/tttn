"""REST client to face-processing-service's internal API — a user's face analysis with
its face-shape probabilities (plan 08).

- `GET /internal/users/{userId}/latest-analysis`
- `GET /internal/analyses/{analysisId}?userId=` (404 when missing or owned by another user)

Both need `X-Internal-Key` and answer the shared envelope (`data` = `LatestAnalysisResponse`).
Every failure (404, timeout, connection error, bad body) returns None: the ranking then
runs without the face part (β=0) instead of failing the request.
"""
import logging
from functools import lru_cache
from typing import Protocol
from uuid import UUID

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import Settings, get_settings
from app.schemas.recommend import FaceShape

logger = logging.getLogger(__name__)


class FaceAnalysisSummary(BaseModel):
    """The fields of face-processing's `LatestAnalysisResponse` the ranking needs.
    `probabilities` is null for analyses created before plan 08."""

    analysisId: str
    faceShape: FaceShape
    probabilities: dict[FaceShape, float] | None = None


class IFaceAnalysisClient(Protocol):
    async def get_latest(self, user_id: UUID) -> FaceAnalysisSummary | None:
        """The user's latest analysis, or None (none yet / face-processing unreachable)."""

    async def get_by_id(self, analysis_id: UUID, user_id: UUID) -> FaceAnalysisSummary | None:
        """The analysis `analysis_id` if it belongs to `user_id`, otherwise None."""


class HttpxFaceAnalysisClient:
    """`httpx`-backed `IFaceAnalysisClient`."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.FACE_PROCESSING_SERVICE_URL
        self._timeout = settings.FACE_PROCESSING_TIMEOUT_SECONDS
        self._headers = {"X-Internal-Key": settings.INTERNAL_API_KEY}

    async def get_latest(self, user_id: UUID) -> FaceAnalysisSummary | None:
        return await self._get(f"/internal/users/{user_id}/latest-analysis", params=None)

    async def get_by_id(self, analysis_id: UUID, user_id: UUID) -> FaceAnalysisSummary | None:
        return await self._get(
            f"/internal/analyses/{analysis_id}", params={"userId": str(user_id)}
        )

    async def _get(self, path: str, params: dict[str, str] | None) -> FaceAnalysisSummary | None:
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url, timeout=self._timeout, headers=self._headers
            ) as client:
                response = await client.get(path, params=params)
        except httpx.HTTPError as exc:
            logger.warning("face-processing-service unreachable (%s): %s", path, exc)
            return None

        if response.status_code == 404:
            return None
        if response.status_code != 200:
            logger.warning(
                "face-processing-service returned %d for %s", response.status_code, path
            )
            return None
        try:
            return FaceAnalysisSummary.model_validate(response.json()["data"])
        except (ValueError, KeyError, TypeError, ValidationError) as exc:
            logger.warning("Unexpected face-processing-service body for %s: %s", path, exc)
            return None


@lru_cache
def get_face_analysis_client() -> HttpxFaceAnalysisClient:
    """FastAPI `Depends` provider — single shared client instance per process."""
    return HttpxFaceAnalysisClient(get_settings())
