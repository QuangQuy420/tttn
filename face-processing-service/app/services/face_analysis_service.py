"""Orchestrates a full `POST /analyze` request: classify, store the photo, persist the result.

Depends on repository *interfaces* (constructor-injected), not concrete implementations — the
`Depends` provider below wires the concrete `S3ImageStorageRepository`/
`SqlAlchemyFaceAnalysisRepository` in. Per coder.md §3, repositories are the ONLY layer touching
S3/DB; this service coordinates them so the router only ever calls one service entry point.
"""
import logging
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import Depends

from app.repositories.face_analysis_repository import (
    IFaceAnalysisRepository,
    get_face_analysis_repository,
)
from app.repositories.image_storage_repository import (
    IImageStorageRepository,
    get_image_storage_repository,
)
from app.schemas.face import AnalyzeResponse
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
    ) -> None:
        self._image_storage = image_storage
        self._face_analysis_repo = face_analysis_repo

    async def analyze_and_store(
        self, user_id: uuid.UUID, data: bytes, filename: str | None, content_type: str
    ) -> AnalyzeResponse:
        """Classify `data`, store it, persist the result, and return the response DTO.

        Propagates `NoFaceDetectedError` / `MultipleFacesDetectedError` / `InvalidImageError`
        from `analyze_face` unchanged — the router maps them to HTTP responses.
        """
        measurements, face_shape, confidence = analyze_face(data)

        s3_key = f"{uuid.uuid4()}-{filename or 'upload'}"
        self._image_storage.upload(key=s3_key, data=data, content_type=content_type)
        image_url = self._image_storage.get_presigned_url(s3_key)

        row = await self._face_analysis_repo.create(
            user_id=user_id,
            s3_key=s3_key,
            face_shape=face_shape,
            measurements=measurements.model_dump(),
            confidence=confidence,
        )

        return AnalyzeResponse(
            id=str(row.id),
            faceShape=face_shape,
            measurements=measurements,
            confidence=confidence,
            imageUrl=image_url,
        )

    async def list_history(self, user_id: uuid.UUID) -> list[AnalyzeResponse]:
        """Return `user_id`'s past analyses, newest first, mapped to `AnalyzeResponse`."""
        rows = await self._face_analysis_repo.list_by_user(user_id)
        return [
            AnalyzeResponse(
                id=str(row.id),
                faceShape=row.face_shape,
                measurements=row.measurements,
                confidence=row.confidence,
                imageUrl=self._image_storage.get_presigned_url(row.s3_key),
            )
            for row in rows
        ]

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
) -> FaceAnalysisService:
    """FastAPI `Depends` provider — constructs the service with its repository deps injected."""
    return FaceAnalysisService(image_storage, face_analysis_repo)
