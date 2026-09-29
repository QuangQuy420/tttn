"""Shared response envelope for every endpoint except `GET /health` and 204 responses.

Success: `{success: true, message, data}` (+ `meta` on list responses only).
Error:   `{success: false, message, error: {code, details}}` — built by the exception
handlers in `app/main.py`.
"""
import math
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, SerializerFunctionWrapHandler, model_serializer

T = TypeVar("T")

DEFAULT_SUCCESS_MESSAGE = "Thành công"
DEFAULT_PAGE_LIMIT = 20
MAX_PAGE_LIMIT = 100


class PageMeta(BaseModel):
    """Pagination info for list responses (camelCase `totalPages` in JSON)."""

    page: int
    limit: int
    total: int
    totalPages: int


class ApiResponse(BaseModel, Generic[T]):
    """Success envelope. `meta` is omitted from the JSON when it's `None`."""

    success: bool = True
    message: str = DEFAULT_SUCCESS_MESSAGE
    data: T
    meta: PageMeta | None = None

    @model_serializer(mode="wrap")
    def _drop_empty_meta(self, handler: SerializerFunctionWrapHandler):
        """`meta` appears only on list responses — drop the key instead of emitting null.

        No return annotation on purpose: with one, the OpenAPI schema collapses to it."""
        dumped = handler(self)
        if dumped.get("meta") is None:
            dumped.pop("meta", None)
        return dumped


class ApiErrorDetail(BaseModel):
    code: str
    details: Any = None


class ApiError(BaseModel):
    """Error envelope."""

    success: bool = False
    message: str
    error: ApiErrorDetail


def ok(data: T, message: str = DEFAULT_SUCCESS_MESSAGE) -> ApiResponse[T]:
    return ApiResponse(message=message, data=data)


def paginated(
    items: list[T], total: int, page: int, limit: int, message: str = DEFAULT_SUCCESS_MESSAGE
) -> ApiResponse[list[T]]:
    return ApiResponse(
        message=message,
        data=items,
        meta=PageMeta(
            page=page,
            limit=limit,
            total=total,
            totalPages=math.ceil(total / limit) if limit > 0 else 0,
        ),
    )
