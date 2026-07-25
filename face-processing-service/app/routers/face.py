"""`POST /analyze`, `GET /analyses`, and `GET /health` — thin routers, no business logic.

Validates content-type/size at the boundary (HTTP-level constraints on the raw upload,
not domain logic), then delegates the actual analyze/store/persist orchestration to
`FaceAnalysisService` via `Depends` — per coder.md §3, routers must not call
repositories (S3/DB) directly.

`X-User-Id` is trusted as-is: `api-gateway` has already verified the caller's JWT and
forwards this header — this service does not re-verify the JWT itself (Q4).
"""
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, status

from app.schemas.face import AnalyzeResponse
from app.services.face_analysis_service import (
    FaceAnalysisService,
    HistoryItemNotFoundError,
    get_face_analysis_service,
)
from app.services.face_shape_service import (
    InvalidImageError,
    MultipleFacesDetectedError,
    NoFaceDetectedError,
)

router = APIRouter()

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB (NFR2)


def _require_user_id(x_user_id: str | None) -> uuid.UUID:
    """Parse the `X-User-Id` header, raising 400 (not FastAPI's default 422) if it's
    missing or not a valid UUID — gateway guarantees it's present, but the router still
    validates defensively (Q4: this service trusts, but does not skip presence checks)."""
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thiếu header bắt buộc 'X-User-Id'.",
        )
    try:
        return uuid.UUID(x_user_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Header 'X-User-Id' phải là UUID hợp lệ.",
        ) from exc


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    service: FaceAnalysisService = Depends(get_face_analysis_service),
) -> AnalyzeResponse:
    user_id = _require_user_id(x_user_id)

    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Định dạng tệp '{file.content_type}' không được hỗ trợ — "
                "chỉ chấp nhận image/jpeg, image/png, hoặc image/webp."
            ),
        )

    data = await file.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ảnh quá lớn — dung lượng tối đa cho phép là 10MB.",
        )

    try:
        return await service.analyze_and_store(
            user_id=user_id, data=data, filename=file.filename, content_type=file.content_type
        )
    except NoFaceDetectedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except MultipleFacesDetectedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except InvalidImageError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/analyses", response_model=list[AnalyzeResponse])
async def list_analyses(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    service: FaceAnalysisService = Depends(get_face_analysis_service),
) -> list[AnalyzeResponse]:
    user_id = _require_user_id(x_user_id)
    return await service.list_history(user_id)


@router.delete("/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis(
    analysis_id: uuid.UUID,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    service: FaceAnalysisService = Depends(get_face_analysis_service),
) -> None:
    user_id = _require_user_id(x_user_id)
    try:
        await service.delete_history_item(user_id=user_id, analysis_id=analysis_id)
    except HistoryItemNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy lịch sử phân tích.",
        ) from exc
