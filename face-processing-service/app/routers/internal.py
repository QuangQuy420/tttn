"""`/internal/*` — service-to-service reads of face analyses (not routed by api-gateway).

Every route requires `X-Internal-Key` (`require_internal_key`, 403 otherwise). A bad
`userId` path param becomes 400 `VALIDATION_FAILED` via the handler in `app/main.py`.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.internal_auth import require_internal_key
from app.schemas.common import ApiResponse, ok
from app.schemas.face import LatestAnalysisResponse
from app.services.face_analysis_service import FaceAnalysisService, get_face_analysis_service

router = APIRouter(prefix="/internal", dependencies=[Depends(require_internal_key)])


@router.get(
    "/users/{user_id}/latest-analysis",
    response_model=ApiResponse[LatestAnalysisResponse],
)
async def get_latest_analysis(
    user_id: uuid.UUID,
    service: FaceAnalysisService = Depends(get_face_analysis_service),
) -> ApiResponse[LatestAnalysisResponse]:
    latest = await service.get_latest(user_id)
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Người dùng chưa có kết quả phân tích khuôn mặt.",
        )
    return ok(latest)
