"""`POST /recommend`, `GET /recommendations/for-you` and `GET /health` — thin router, no
business logic.

Validates input (Pydantic body / query, `X-User-Id` header set by api-gateway), delegates
ranking to `RecommendationService` via `Depends`, and maps downstream errors to clear HTTP
statuses instead of an unhandled 500 (NFR3/AC6) — mirroring
`face-processing-service/app/routers/face.py`'s domain-error-to-HTTPException mapping.
"""
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.repositories.product_client import (
    ProductServiceTimeoutError,
    ProductServiceUnavailableError,
)
from app.schemas.common import ApiResponse
from app.schemas.recommend import ForYouResponse, RecommendedProductDto, RecommendRequest
from app.services.recommendation_service import (
    BehaviorStoreUnavailableError,
    RecommendationService,
    get_recommendation_service,
)

router = APIRouter()


def _require_user_id(x_user_id: str | None) -> uuid.UUID:
    """Parse the `X-User-Id` header, raising 400 (not FastAPI's default 422) if it's
    missing or not a valid UUID (same as face-processing-service's `_require_user_id`)."""
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


def _optional_user_id(x_user_id: str | None) -> uuid.UUID | None:
    """`X-User-Id` on the anonymous-allowed `POST /recommend`: missing or not a UUID →
    anonymous."""
    if not x_user_id:
        return None
    try:
        return uuid.UUID(x_user_id)
    except ValueError:
        return None


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/recommend", response_model=ApiResponse[list[RecommendedProductDto]])
async def recommend(
    request: RecommendRequest,
    x_user_id: str | None = Header(default=None),
    service: RecommendationService = Depends(get_recommendation_service),
) -> ApiResponse[list[RecommendedProductDto]]:
    try:
        return await service.recommend(request, user_id=_optional_user_id(x_user_id))
    except ProductServiceTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)
        ) from exc
    except ProductServiceUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


@router.get("/recommendations/for-you", response_model=ApiResponse[ForYouResponse])
async def for_you(
    limit: int = Query(default=10, ge=1, le=50),
    faceAnalysisId: uuid.UUID | None = Query(default=None),
    x_user_id: str | None = Header(default=None),
    service: RecommendationService = Depends(get_recommendation_service),
) -> ApiResponse[ForYouResponse]:
    user_id = _require_user_id(x_user_id)
    try:
        return await service.for_you(user_id, limit, faceAnalysisId)
    except ProductServiceTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)
        ) from exc
    except (ProductServiceUnavailableError, BehaviorStoreUnavailableError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
