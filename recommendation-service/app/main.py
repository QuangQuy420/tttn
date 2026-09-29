"""FastAPI entrypoint — app instance, lifespan (behavior-events consumer), router
mounting, envelope exception handlers."""
import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.db.session import get_engine
from app.repositories.behavior_event_consumer import BehaviorEventConsumer
from app.repositories.interaction_repository import interaction_repository_scope
from app.routers.internal import router as internal_router
from app.routers.recommend import router as recommend_router
from app.schemas.common import error_body
from app.services.interaction_ingest_service import InteractionIngestService

logger = logging.getLogger(__name__)

# Generic `error.code` per status when nothing more specific applies (plan's envelope contract).
_ERROR_CODE_BY_STATUS: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    502: "EXTERNAL_SERVICE_ERROR",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
    500: "INTERNAL_ERROR",
}

# RabbitMQ's healthcheck can report "healthy" slightly before the AMQP listener accepts
# connections — mirrors product-service's publisher (INITIAL_CONNECT_ATTEMPTS /
# RECONNECT_DELAY_MS in product-event-publisher.repository.ts).
_INITIAL_CONNECT_ATTEMPTS = 5
_RECONNECT_DELAY_SECONDS = 3


async def _start_consumer_with_retry(consumer: BehaviorEventConsumer) -> None:
    """Keep trying the first connect every few seconds until it succeeds. Runs as a
    background task so startup and `/health` never wait on RabbitMQ; after the first
    connect, `connect_robust` handles reconnects by itself."""
    attempt = 0
    while True:
        attempt += 1
        try:
            await consumer.start()
            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if attempt == _INITIAL_CONNECT_ATTEMPTS:
                logger.warning(
                    "Still cannot connect to RabbitMQ after %d attempts — behavior events "
                    "will not be stored until it connects; retrying every %ss",
                    attempt,
                    _RECONNECT_DELAY_SECONDS,
                )
            else:
                logger.error("Failed to connect to RabbitMQ (attempt %d): %s", attempt, exc)
        await asyncio.sleep(_RECONNECT_DELAY_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    consumer: BehaviorEventConsumer | None = None
    consumer_task: asyncio.Task | None = None
    if settings.BEHAVIOR_CONSUMER_ENABLED:
        consumer = BehaviorEventConsumer(
            settings, InteractionIngestService(interaction_repository_scope)
        )
        consumer_task = asyncio.create_task(_start_consumer_with_retry(consumer))

    yield

    if consumer_task is not None:
        consumer_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await consumer_task
    if consumer is not None:
        await consumer.stop()
    # Dispose only if something actually created the engine, so a flag-off
    # `with TestClient(app)` never needs a database.
    if get_engine.cache_info().currsize:
        await get_engine().dispose()


app = FastAPI(title="recommendation-service", lifespan=lifespan)

app.include_router(recommend_router)
app.include_router(internal_router)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = _ERROR_CODE_BY_STATUS.get(
        exc.status_code, "INTERNAL_ERROR" if exc.status_code >= 500 else "BAD_REQUEST"
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(str(exc.detail), code),
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = [
        {
            "field": ".".join(str(part) for part in error["loc"] if part != "body"),
            "message": error["msg"],
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=400,
        content=error_body("Dữ liệu không hợp lệ.", "VALIDATION_FAILED", details),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content=error_body("Lỗi hệ thống, vui lòng thử lại sau.", "INTERNAL_ERROR"),
    )
