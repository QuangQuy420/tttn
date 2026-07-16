"""REST client to `product-service` — interface + `httpx`-backed implementation.

Per coder.md §3, this is the ONLY layer that talks to product-service; handles
timeouts/unreachability explicitly (raises a typed error) rather than letting a
downstream failure surface as an unhandled 500, mirroring how
`face-processing-service`'s repositories isolate their own external-state access.
"""
from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import Settings, get_settings
from app.schemas.recommend import FrameShape, GenderTarget, RecommendedProductDto


class ProductServiceError(Exception):
    """Base class for domain errors raised when talking to product-service."""


class ProductServiceTimeoutError(ProductServiceError):
    """product-service did not respond within the configured timeout."""


class ProductServiceUnavailableError(ProductServiceError):
    """product-service is unreachable (connection refused/reset/DNS failure/etc.)."""


class IProductServiceClient(Protocol):
    async def list_products(
        self,
        face_shape: str,
        frame_shape: str | None = None,
        gender_target: str | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        limit: int | None = None,
    ) -> list[RecommendedProductDto]:
        """Return products matching `face_shape` (+ optional filters) from
        `GET /products` on product-service. Raises `ProductServiceTimeoutError` /
        `ProductServiceUnavailableError` if product-service can't be reached in time."""


class HttpxProductServiceClient:
    """`httpx`-backed `IProductServiceClient` against product-service's `GET /products`."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.PRODUCT_SERVICE_URL
        self._timeout = settings.PRODUCT_SERVICE_TIMEOUT_SECONDS

    async def list_products(
        self,
        face_shape: str,
        frame_shape: str | None = None,
        gender_target: str | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        limit: int | None = None,
    ) -> list[RecommendedProductDto]:
        params: dict[str, str | float | int] = {"faceShape": face_shape}
        if frame_shape is not None:
            params["frameShape"] = frame_shape
        if gender_target is not None:
            params["genderTarget"] = gender_target
        if min_price is not None:
            params["minPrice"] = min_price
        if max_price is not None:
            params["maxPrice"] = max_price
        if limit is not None:
            params["limit"] = limit

        try:
            async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
                response = await client.get("/products", params=params)
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise ProductServiceTimeoutError(
                "product-service không phản hồi kịp thời."
            ) from exc
        except httpx.HTTPStatusError as exc:
            # product-service responded but with an error status — treat as unavailable
            # for this service's purposes (there's no per-caller-input path that would
            # cause product-service to 4xx here; a well-formed faceShape/filters are
            # always valid query params).
            raise ProductServiceUnavailableError(
                f"product-service trả về lỗi: {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            raise ProductServiceUnavailableError(
                "Không thể kết nối tới product-service."
            ) from exc

        body = response.json()
        return [RecommendedProductDto(**item, score=0.0) for item in body["items"]]


@lru_cache
def get_product_service_client() -> HttpxProductServiceClient:
    """FastAPI `Depends` provider — single shared client instance per process."""
    return HttpxProductServiceClient(get_settings())
