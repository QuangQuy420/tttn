"""REST client to `product-service` — interface + `httpx`-backed implementation.

Per coder.md §3, this is the ONLY layer that talks to product-service; handles
timeouts/unreachability explicitly (raises a typed error) rather than letting a
downstream failure surface as an unhandled 500, mirroring how
`face-processing-service`'s repositories isolate their own external-state access.
"""
import asyncio
import logging
from functools import lru_cache
from typing import Any, Protocol

import httpx
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.ttl_cache import TtlCache
from app.ml.features import MATERIAL_TYPES
from app.schemas.recommend import (
    CatalogProductDto,
    FrameShape,
    GenderTarget,
    RecommendedProductDto,
)

logger = logging.getLogger(__name__)

# product-service's max `limit` per page.
CATALOG_PAGE_SIZE = 100


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

    async def list_catalog(self) -> list[CatalogProductDto]:
        """Every published product (all pages of `GET /products`, no `faceShape` filter),
        de-duplicated by `id` and cached for `CATALOG_TTL_SECONDS`. Items whose enums the
        ranker features do not know are skipped. Raises the same errors as
        `list_products`."""


class HttpxProductServiceClient:
    """`httpx`-backed `IProductServiceClient` against product-service's `GET /products`."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.PRODUCT_SERVICE_URL
        self._timeout = settings.PRODUCT_SERVICE_TIMEOUT_SECONDS
        self._catalog_ttl = settings.CATALOG_TTL_SECONDS
        self._catalog_cache: TtlCache[list[CatalogProductDto]] = TtlCache()
        # Single flight: one catalog fetch per cache expiry.
        self._catalog_lock = asyncio.Lock()

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

        # product-service wraps lists in the shared envelope `{success, message, data, meta}`.
        body = response.json()
        return [RecommendedProductDto(**item, score=0.0) for item in body["data"]]

    async def list_catalog(self) -> list[CatalogProductDto]:
        cached = self._catalog_cache.get()
        if cached is not None:
            return cached
        async with self._catalog_lock:
            # Another request may have fetched it while this one waited for the lock.
            cached = self._catalog_cache.get()
            if cached is not None:
                return cached
            return await self._fetch_catalog()

    async def _fetch_catalog(self) -> list[CatalogProductDto]:
        products: dict[str, CatalogProductDto] = {}
        page, total_pages = 1, 1
        try:
            async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout) as client:
                while page <= total_pages:
                    response = await client.get(
                        "/products", params={"page": page, "limit": CATALOG_PAGE_SIZE}
                    )
                    response.raise_for_status()
                    body = response.json()
                    for item in body["data"]:
                        product = _parse_catalog_item(item)
                        if product is not None:
                            products.setdefault(product.id, product)
                    total_pages = int(body["meta"]["totalPages"])
                    page += 1
        except httpx.TimeoutException as exc:
            raise ProductServiceTimeoutError(
                "product-service không phản hồi kịp thời."
            ) from exc
        except httpx.HTTPStatusError as exc:
            raise ProductServiceUnavailableError(
                f"product-service trả về lỗi: {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            raise ProductServiceUnavailableError(
                "Không thể kết nối tới product-service."
            ) from exc

        catalog = list(products.values())
        self._catalog_cache.set(catalog, self._catalog_ttl)
        return catalog


def _parse_catalog_item(item: dict[str, Any]) -> CatalogProductDto | None:
    """One catalog item, or None (with a warning) when it does not fit the feature enums —
    one bad product must not fail the whole catalog (the features would raise on it)."""
    try:
        product = CatalogProductDto.model_validate(item)
    except ValidationError as exc:
        logger.warning("Skipping catalog product %s: %s", item.get("id"), exc)
        return None
    if product.materialType is not None and product.materialType not in MATERIAL_TYPES:
        logger.warning(
            "Skipping catalog product %s: unknown materialType %r", product.id, product.materialType
        )
        return None
    return product


@lru_cache
def get_product_service_client() -> HttpxProductServiceClient:
    """FastAPI `Depends` provider — single shared client instance per process."""
    return HttpxProductServiceClient(get_settings())
