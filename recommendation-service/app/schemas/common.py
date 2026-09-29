"""Shared response envelope used by every endpoint except `GET /health`.

Success: `{success: true, message, data}` (+ `meta` on list responses only).
Error:   `{success: false, message, error: {code, details}}`.
Field names are camelCase on purpose (`totalPages`) so the JSON matches the other
services' envelopes without an alias generator.
"""
import math
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, model_serializer

T = TypeVar("T")

DEFAULT_SUCCESS_MESSAGE = "Thành công"


class PageMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class ApiError(BaseModel):
    code: str
    details: Any = None


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = DEFAULT_SUCCESS_MESSAGE
    data: T
    meta: PageMeta | None = None

    @model_serializer(mode="wrap")
    def _drop_empty_meta(self, handler):
        # `meta` is only part of the contract for list responses — omit it instead of
        # emitting `"meta": null` on single-object responses.
        serialized = handler(self)
        if serialized.get("meta") is None:
            serialized.pop("meta", None)
        return serialized


class ApiErrorResponse(BaseModel):
    success: bool = False
    message: str
    error: ApiError


def ok(data: T, message: str = DEFAULT_SUCCESS_MESSAGE) -> ApiResponse[T]:
    return ApiResponse(message=message, data=data)


def paginated(items: list[T], total: int, page: int, limit: int) -> ApiResponse[list[T]]:
    return ApiResponse(
        data=items,
        meta=PageMeta(
            page=page,
            limit=limit,
            total=total,
            totalPages=math.ceil(total / limit) if limit > 0 else 0,
        ),
    )


def error_body(message: str, code: str, details: Any = None) -> dict:
    return ApiErrorResponse(
        message=message, error=ApiError(code=code, details=details)
    ).model_dump(mode="json")
