"""`POST /recommend` and `GET /health` — thin router, no business logic.

Validates the request via `RecommendRequest` (Pydantic), delegates ranking to
`RecommendationService` via `Depends`, and maps downstream product-service errors to
clear HTTP statuses instead of an unhandled 500 (NFR3/AC6) — mirroring
`face-processing-service/app/routers/face.py`'s domain-error-to-HTTPException mapping.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.repositories.product_client import (
    ProductServiceTimeoutError,
    ProductServiceUnavailableError,
)
from app.schemas.recommend import RecommendRequest, RecommendResponse
from app.services.recommendation_service import (
    RecommendationService,
    get_recommendation_service,
)

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/recommend", response_model=RecommendResponse)
async def recommend(
    request: RecommendRequest,
    service: RecommendationService = Depends(get_recommendation_service),
) -> RecommendResponse:
    try:
        return await service.recommend(request)
    except ProductServiceTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)
        ) from exc
    except ProductServiceUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc
