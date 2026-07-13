"""`POST /analyze` and `GET /health` — thin routers, no business logic.

Validates content-type/size at the boundary (HTTP-level constraints on the raw upload,
not domain logic), then delegates the actual analyze/store/persist orchestration to
`FaceAnalysisService` via `Depends` — per coder.md §3, routers must not call
repositories (S3/DB) directly.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.schemas.face import AnalyzeResponse
from app.services.face_analysis_service import FaceAnalysisService, get_face_analysis_service
from app.services.face_shape_service import (
    InvalidImageError,
    MultipleFacesDetectedError,
    NoFaceDetectedError,
)

router = APIRouter()

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB (NFR2)


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile,
    service: FaceAnalysisService = Depends(get_face_analysis_service),
) -> AnalyzeResponse:
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported content type '{file.content_type}' — "
                "expected image/jpeg, image/png, or image/webp."
            ),
        )

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image is too large — maximum upload size is 10MB.",
        )

    try:
        return await service.analyze_and_store(
            data=data, filename=file.filename, content_type=file.content_type
        )
    except NoFaceDetectedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except MultipleFacesDetectedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except InvalidImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
