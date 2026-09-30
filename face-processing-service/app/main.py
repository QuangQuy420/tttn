"""FastAPI entrypoint — app instance, router mounting, startup DI wiring, error envelope."""
import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.repositories.image_storage_repository import get_image_storage_repository
from app.routers.face import router as face_router
from app.routers.internal import router as internal_router
from app.schemas.common import ApiError, ApiErrorDetail
from app.services.face_classifier import get_face_shape_classifier

logger = logging.getLogger(__name__)

# Generic `error.code` per HTTP status (see the envelope contract in the plan).
_ERROR_CODES: dict[int, str] = {
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

# Vietnamese fallback messages, used when an HTTPException carries only Starlette's
# default English reason phrase (e.g. unknown route → "Not Found").
_DEFAULT_MESSAGES: dict[int, str] = {
    400: "Yêu cầu không hợp lệ.",
    401: "Chưa xác thực.",
    403: "Không có quyền truy cập.",
    404: "Không tìm thấy tài nguyên.",
    405: "Phương thức không được hỗ trợ.",
    409: "Xung đột dữ liệu.",
    500: "Lỗi hệ thống, vui lòng thử lại sau.",
}

app = FastAPI(title="face-processing-service")

app.include_router(face_router)
app.include_router(internal_router)


def _error_response(status_code: int, message: str, code: str, details: Any = None) -> JSONResponse:
    body = ApiError(message=message, error=ApiErrorDetail(code=code, details=details))
    return JSONResponse(status_code=status_code, content=jsonable_encoder(body))


def _error_code(status_code: int) -> str:
    if status_code in _ERROR_CODES:
        return _ERROR_CODES[status_code]
    return "INTERNAL_ERROR" if status_code >= 500 else "BAD_REQUEST"


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Covers our own `HTTPException`s and Starlette's (unknown route 404, 405)."""
    detail = exc.detail
    try:
        is_default_phrase = detail == HTTPStatus(exc.status_code).phrase
    except ValueError:
        is_default_phrase = False
    if isinstance(detail, str) and not is_default_phrase:
        message = detail
    else:
        fallback = _DEFAULT_MESSAGES[500 if exc.status_code >= 500 else 400]
        message = _DEFAULT_MESSAGES.get(exc.status_code, fallback)
    response = _error_response(exc.status_code, message, _error_code(exc.status_code))
    if exc.headers:
        response.headers.update(exc.headers)
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Validation errors → 400 `VALIDATION_FAILED` (not FastAPI's default 422).

    `details` is `[{field, message}]` — same shape as recommendation-service; raw
    `exc.errors()` is not echoed back (it contains the client's input)."""
    details = [
        {"field": _error_field(error["loc"]), "message": error["msg"]}
        for error in exc.errors()
    ]
    return _error_response(
        status.HTTP_400_BAD_REQUEST,
        "Dữ liệu không hợp lệ.",
        "VALIDATION_FAILED",
        details,
    )


def _error_field(loc: tuple | list) -> str:
    """`("query", "limit")` → `"limit"`; drops the `body`/`query` prefix."""
    parts = list(loc)
    if parts and parts[0] in ("body", "query"):
        parts = parts[1:]
    return ".".join(str(part) for part in parts) or "body"


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Lỗi không xử lý được khi gọi %s %s", request.method, request.url.path)
    return _error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        _DEFAULT_MESSAGES[500],
        "INTERNAL_ERROR",
    )


@app.on_event("startup")
async def on_startup() -> None:
    """Load the face-shape classifier (a bad/missing model raises `ModelLoadError` here, so
    the service fails at boot) and ensure the private `face-images` bucket exists."""
    get_face_shape_classifier()
    image_storage = get_image_storage_repository()
    image_storage.ensure_bucket()
