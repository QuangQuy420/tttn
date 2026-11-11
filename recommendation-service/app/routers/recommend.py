"""`POST /recommend`, `GET /recommendations/for-you`, `GET /health` (liveness) and
`GET /health/ready` (readiness: DB, Redis, RabbitMQ) — thin router, no business logic.

Validates input (Pydantic body / query, `X-User-Id` header set by api-gateway), delegates
ranking to `RecommendationService` via `Depends`, and maps downstream errors to clear HTTP
statuses instead of an unhandled 500 (NFR3/AC6) — mirroring
`face-processing-service/app/routers/face.py`'s domain-error-to-HTTPException mapping.
"""
import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories.catalog_cache import ICatalogCache, get_catalog_cache
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

logger = logging.getLogger(__name__)

router = APIRouter()

# Per-check bound for `GET /health/ready`, so a hung dependency answers 503, not a hang.
_READY_CHECK_TIMEOUT_SECONDS = 2.0


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


@router.get("/health/ready")
async def ready(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    catalog_cache: ICatalogCache = Depends(get_catalog_cache),
) -> JSONResponse:
    """200 `{"status": "ok", "checks": {...}}` when DB, Redis and the enabled RabbitMQ
    consumers are up; otherwise 503 `{"status": "unavailable", "checks": {...}}` with
    `"error"` on the failing ones. Not wrapped in the envelope (like `/health`)."""
    checks: dict[str, str] = {}

    try:
        await asyncio.wait_for(session.execute(text("SELECT 1")), _READY_CHECK_TIMEOUT_SECONDS)
        checks["db"] = "ok"
    except Exception as exc:
        logger.warning("Readiness: database check failed: %r", exc)
        checks["db"] = "error"

    try:
        redis_ok = await asyncio.wait_for(catalog_cache.ping(), _READY_CHECK_TIMEOUT_SECONDS)
    except Exception as exc:
        logger.warning("Readiness: Redis check failed: %r", exc)
        redis_ok = False
    checks["redis"] = "ok" if redis_ok else "error"

    # The lifespan sets these (None = consumer disabled); absent when it never ran.
    consumers = [
        consumer
        for consumer in (
            getattr(request.app.state, "behavior_consumer", None),
            getattr(request.app.state, "product_consumer", None),
        )
        if consumer is not None
    ]
    if not consumers:
        checks["broker"] = "disabled"
    else:
        checks["broker"] = "ok" if all(c.is_connected for c in consumers) else "error"

    healthy = "error" not in checks.values()
    return JSONResponse(
        status_code=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "ok" if healthy else "unavailable", "checks": checks},
    )


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
