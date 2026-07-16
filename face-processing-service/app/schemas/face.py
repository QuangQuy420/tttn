"""Pydantic request/response DTOs for `POST /analyze`.

NOTE: `AnalyzeResponse` is a contract other teammates (api-gateway, web) will build
against — keep field names/shape stable; flag before changing.
"""
from pydantic import BaseModel, Field

from app.db.models import FaceShape


class FaceMeasurements(BaseModel):
    """Raw landmark-derived measurements + the ratios used for classification.

    Lengths/widths are in normalized image-space units (fractions of image
    width/height, as produced by MediaPipe's normalized landmarks) — not millimeters,
    since no physical reference scale is available from a single 2D photo.
    """

    face_length: float = Field(..., description="Hairline/forehead-top to chin distance")
    forehead_width: float = Field(..., description="Width across the forehead (temple to temple)")
    cheekbone_width: float = Field(..., description="Width across the cheekbones (widest point)")
    jaw_width: float = Field(..., description="Width across the jaw (gonion to gonion)")
    length_to_width_ratio: float = Field(..., description="face_length / cheekbone_width")
    cheekbone_to_jaw_ratio: float = Field(..., description="jaw_width / cheekbone_width")
    forehead_to_jaw_ratio: float = Field(..., description="forehead_width / jaw_width")


class AnalyzeResponse(BaseModel):
    """Response body for a successful `POST /analyze`."""

    id: str = Field(..., description="Persisted FaceAnalysis row id (UUID)")
    faceShape: FaceShape
    measurements: FaceMeasurements
    confidence: float = Field(..., ge=0.0, le=1.0)
    imageUrl: str = Field(..., description="Presigned GET URL for the uploaded photo")


class ErrorResponse(BaseModel):
    """Generic error body shape for all domain error responses below."""

    detail: str


class NoFaceDetectedError(ErrorResponse):
    detail: str = "Không phát hiện khuôn mặt nào trong ảnh đã tải lên."


class MultipleFacesDetectedError(ErrorResponse):
    detail: str = "Phát hiện nhiều khuôn mặt — vui lòng tải lên ảnh chỉ có đúng 1 khuôn mặt."


class InvalidImageError(ErrorResponse):
    detail: str = "Ảnh không hợp lệ: định dạng không được hỗ trợ hoặc tệp quá lớn."
