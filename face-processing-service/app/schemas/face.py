"""Pydantic request/response DTOs for `POST /analyze`.

NOTE: `AnalyzeResponse` is a contract other teammates (api-gateway, web) will build
against — keep field names/shape stable; flag before changing.
"""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.db.models import FaceShape


class FaceMeasurements(BaseModel):
    """Raw landmark-derived measurements + the ratios used for classification.

    Lengths/widths are pixel distances divided by the image **width** (so they stay
    "fractions of the image", roughly 0-1.5) — not millimeters, since no physical
    reference scale is available from a single 2D photo.
    """

    face_length: float = Field(..., description="Hairline/forehead-top to chin distance")
    forehead_width: float = Field(..., description="Width across the forehead (temple to temple)")
    cheekbone_width: float = Field(..., description="Width across the cheekbones (widest point)")
    jaw_width: float = Field(..., description="Width across the jaw (gonion to gonion)")
    length_to_width_ratio: float = Field(..., description="face_length / cheekbone_width")
    cheekbone_to_jaw_ratio: float = Field(..., description="jaw_width / cheekbone_width")
    forehead_to_jaw_ratio: float = Field(..., description="forehead_width / jaw_width")


class FaceQuality(BaseModel):
    """Head pose of the analyzed face, in degrees (1 decimal)."""

    yaw: float
    pitch: float
    roll: float


class AnalyzeResponse(BaseModel):
    """Response body for a successful `POST /analyze` (also each `GET /analyses` item).

    The last 4 fields were added in plan 08 — they are null for history rows created
    before it, and `quality` is only set by `POST /analyze` (not persisted).
    """

    id: str = Field(..., description="Persisted FaceAnalysis row id (UUID)")
    faceShape: FaceShape
    measurements: FaceMeasurements
    confidence: float = Field(..., ge=0.0, le=1.0)
    imageUrl: str = Field(..., description="Presigned GET URL for the uploaded photo")
    probabilities: dict[FaceShape, float] | None = Field(
        default=None, description="Probability of each of the 6 face shapes (sum ~ 1)"
    )
    method: Literal["ml", "rule"] | None = None
    modelVersion: str | None = None
    quality: FaceQuality | None = None


class LatestAnalysisResponse(BaseModel):
    """Body of `GET /internal/users/{userId}/latest-analysis` (service-to-service)."""

    analysisId: uuid.UUID
    userId: uuid.UUID
    faceShape: FaceShape
    probabilities: dict[FaceShape, float] | None = None
    method: Literal["ml", "rule"] | None = None
    modelVersion: str | None = None
    createdAt: datetime


class ErrorResponse(BaseModel):
    """Generic error body shape for all domain error responses below."""

    detail: str


class NoFaceDetectedError(ErrorResponse):
    detail: str = "Không phát hiện khuôn mặt nào trong ảnh đã tải lên."


class MultipleFacesDetectedError(ErrorResponse):
    detail: str = "Phát hiện nhiều khuôn mặt — vui lòng tải lên ảnh chỉ có đúng 1 khuôn mặt."


class InvalidImageError(ErrorResponse):
    detail: str = "Ảnh không hợp lệ: định dạng không được hỗ trợ hoặc tệp quá lớn."
