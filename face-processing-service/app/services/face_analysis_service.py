"""Orchestrates a full `POST /analyze` request: classify, store the photo, persist the result.

Depends on repository *interfaces* (constructor-injected), not concrete implementations — the
`Depends` provider below wires the concrete `S3ImageStorageRepository`/
`SqlAlchemyFaceAnalysisRepository` in. Per coder.md §3, repositories are the ONLY layer touching
S3/DB; this service coordinates them so the router only ever calls one service entry point.
"""
import logging
import time
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends
from starlette.concurrency import run_in_threadpool

from app.core.config import Settings, get_settings

from app.repositories.face_analysis_repository import (
    IFaceAnalysisRepository,
    get_face_analysis_repository,
)
from app.repositories.image_storage_repository import (
    IImageStorageRepository,
    get_image_storage_repository,
)
from app.schemas.face import AnalyzeResponse, LatestAnalysisResponse
from app.services.face_classifier import FaceShapeClassifier, get_face_shape_classifier
from app.services.face_shape_service import analyze_face

logger = logging.getLogger(__name__)


class HistoryItemNotFoundError(Exception):
    """Raised when a history item doesn't exist, or exists but isn't owned by the
    caller — both cases use this same error so the router can't leak which is true."""


class FaceAnalysisService:
    """Coordinates classification (`face_shape_service.analyze_face`) with the two repositories
    for one upload. Constructed with its dependencies injected (DIP) — never reaches for a
    concrete S3 client or DB session itself."""

    def __init__(
        self,
        image_storage: IImageStorageRepository,
        face_analysis_repo: IFaceAnalysisRepository,
        classifier: FaceShapeClassifier,
        max_yaw_deg: float,
        min_cheek_px: float = 80.0,
    ) -> None:
        self._image_storage = image_storage
        self._face_analysis_repo = face_analysis_repo
        self._classifier = classifier
        self._max_yaw_deg = max_yaw_deg
        self._min_cheek_px = min_cheek_px

    async def analyze_and_store(
        self, user_id: uuid.UUID, data: bytes, filename: str | None, content_type: str
    ) -> AnalyzeResponse:
        """Classify `data`, store it, persist the result, and return the response DTO.

        Propagates `NoFaceDetectedError` / `MultipleFacesDetectedError` / `InvalidImageError` /
        `FacePoseError` / `FaceTooSmallError` from `analyze_face` unchanged — the router maps them to HTTP responses.
        `analyze_face` is CPU-bound, so it runs in the threadpool (keeps the event loop free).
        """
        started = time.perf_counter()
        outcome = await run_in_threadpool(
            analyze_face, data, self._classifier, self._max_yaw_deg, self._min_cheek_px
        )
        logger.info(
            "analyze_face took %.0f ms (method=%s, model=%s)",
            (time.perf_counter() - started) * 1000,
            outcome.result.method,
            outcome.result.model_version,
        )
        measurements = outcome.measurements
        result = outcome.result

        s3_key = f"{uuid.uuid4()}-{filename or 'upload'}"
        self._image_storage.upload(key=s3_key, data=data, content_type=content_type)
        image_url = self._image_storage.get_presigned_url(s3_key)

        row = await self._face_analysis_repo.create(
            user_id=user_id,
            s3_key=s3_key,
            face_shape=result.face_shape,
            measurements=measurements.model_dump(),
            confidence=result.confidence,
            model_version=result.model_version,
            method=result.method,
            probabilities={shape.value: p for shape, p in result.probabilities.items()},
        )

        return AnalyzeResponse(
            id=str(row.id),
            faceShape=result.face_shape,
            measurements=measurements,
            confidence=result.confidence,
            imageUrl=image_url,
            probabilities=result.probabilities,
            method=result.method,
            modelVersion=result.model_version,
            quality=outcome.quality,
        )

    async def list_history(
        self, user_id: uuid.UUID, page: int, limit: int
    ) -> tuple[list[AnalyzeResponse], int]:
        """Return one page of `user_id`'s past analyses (newest first, mapped to
        `AnalyzeResponse`) plus the total number of analyses the user has."""
        total = await self._face_analysis_repo.count_by_user(user_id)
        rows = await self._face_analysis_repo.list_by_user(
            user_id, offset=(page - 1) * limit, limit=limit
        )
        items = [
            AnalyzeResponse(
                id=str(row.id),
                faceShape=row.face_shape,
                measurements=row.measurements,
                confidence=row.confidence,
                imageUrl=self._image_storage.get_presigned_url(row.s3_key),
                probabilities=row.probabilities,
                method=row.method,
                modelVersion=row.model_version,
            )
            for row in rows
        ]
        return items, total

    async def get_latest(self, user_id: uuid.UUID) -> LatestAnalysisResponse | None:
        """Return `user_id`'s newest analysis (for other services), or `None` if they have none."""
        row = await self._face_analysis_repo.get_latest_by_user(user_id)
        if row is None:
            return None
        return LatestAnalysisResponse(
            analysisId=row.id,
            userId=row.user_id,
            faceShape=row.face_shape,
            probabilities=row.probabilities,
            method=row.method,
            modelVersion=row.model_version,
            createdAt=row.created_at,
        )

    async def delete_history_item(self, user_id: uuid.UUID, analysis_id: uuid.UUID) -> None:
        """Delete `analysis_id`, only if it belongs to `user_id`.

        Raises `HistoryItemNotFoundError` if the row doesn't exist OR belongs to a
        different user (same error for both — no signal to the caller which is true).
        The S3 object delete is best-effort: a failure is logged but does not stop the
        DB row from being deleted, so the item still disappears from the user's list
        even if MinIO has a transient hiccup.
        """
        row = await self._face_analysis_repo.get_by_id(analysis_id)
        if row is None or row.user_id != user_id:
            raise HistoryItemNotFoundError("Không tìm thấy lịch sử phân tích.")

        try:
            self._image_storage.delete(row.s3_key)
        except (ClientError, BotoCoreError):
            logger.warning(
                "Không thể xóa ảnh %s khỏi bộ nhớ đối tượng cho lịch sử %s",
                row.s3_key,
                analysis_id,
                exc_info=True,
            )

        await self._face_analysis_repo.delete(analysis_id, user_id)


def get_face_analysis_service(
    image_storage: IImageStorageRepository = Depends(get_image_storage_repository),
    face_analysis_repo: IFaceAnalysisRepository = Depends(get_face_analysis_repository),
    classifier: FaceShapeClassifier = Depends(get_face_shape_classifier),
    settings: Settings = Depends(get_settings),
) -> FaceAnalysisService:
    """FastAPI `Depends` provider — constructs the service with its deps injected."""
    return FaceAnalysisService(
        image_storage,
        face_analysis_repo,
        classifier,
        settings.FACE_MAX_YAW_DEG,
        min_cheek_px=settings.FACE_MIN_CHEEK_PX,
    )
