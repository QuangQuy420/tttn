"""FastAPI entrypoint — app instance, router mounting, envelope exception handlers."""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.routers.recommend import router as recommend_router
from app.schemas.common import error_body

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

app = FastAPI(title="recommendation-service")

app.include_router(recommend_router)


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
