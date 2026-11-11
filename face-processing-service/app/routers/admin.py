"""`/admin/*` — read-only admin views (model info + face-shape analytics), called by api-gateway.

Every route requires `X-Internal-Key` (`require_internal_key`, 403 otherwise). `from`/`to`
are `YYYY-MM-DD` calendar days in `Asia/Ho_Chi_Minh`; a malformed date becomes 400
`VALIDATION_FAILED`, a bad range 400 with a Vietnamese message.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.internal_auth import require_internal_key
from app.schemas.admin import FaceShapeDistributionResponse, FaceShapeModelInfo
from app.schemas.common import ApiResponse, ok
from app.services.admin_service import AdminService, InvalidDateRangeError, get_admin_service

router = APIRouter(prefix="/admin", dependencies=[Depends(require_internal_key)])


@router.get("/model-info", response_model=ApiResponse[FaceShapeModelInfo])
async def get_model_info(
    service: AdminService = Depends(get_admin_service),
) -> ApiResponse[FaceShapeModelInfo]:
    return ok(service.model_info())


@router.get(
    "/analytics/face-shapes",
    response_model=ApiResponse[FaceShapeDistributionResponse],
)
async def get_face_shape_distribution(
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    service: AdminService = Depends(get_admin_service),
) -> ApiResponse[FaceShapeDistributionResponse]:
    try:
        distribution = await service.face_shape_distribution(date_from, date_to)
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ok(distribution)
