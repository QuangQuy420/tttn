"""Unit tests for `HttpxProductServiceClient.list_products` — the one place this service
talks to `product-service` over HTTP. Uses `httpx.MockTransport` (swapped in via
monkeypatching `httpx.AsyncClient`, since the client builds its own `AsyncClient`
internally rather than accepting an injectable transport) so these run without any real
network call, exercising the exact timeout/4xx-5xx/unreachable branches
`app/repositories/product_client.py` maps to domain errors.
"""
import asyncio

import httpx
import pytest

from app.core.config import Settings
from app.repositories.product_client import (
    HttpxProductServiceClient,
    ProductServiceTimeoutError,
    ProductServiceUnavailableError,
)

_SETTINGS = Settings(PRODUCT_SERVICE_URL="http://product-service:3002")

_PRODUCT_ITEM = {
    "id": "p1",
    "sku": "SKU-1",
    "name": "Test Frame",
    "slug": "test-frame",
    "frameShape": "SQUARE",
    "basePrice": 100.0,
    "brand": {"id": "b1", "name": "Brand", "logoUrl": None},
    "images": [],
    "faceShapes": ["ROUND"],
}


def _install_mock_transport(monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport) -> None:
    """Force `HttpxProductServiceClient`'s internally-constructed `httpx.AsyncClient` to use
    `transport` instead of a real network transport, regardless of the args it's built with."""
    real_async_client = httpx.AsyncClient

    class _PatchedAsyncClient(real_async_client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr("app.repositories.product_client.httpx.AsyncClient", _PatchedAsyncClient)


def test_list_products_parses_a_successful_response(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_request: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_request["url"] = request.url
        return httpx.Response(200, json={"success": True, "message": "Thành công", "data": [_PRODUCT_ITEM]})

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))
    client = HttpxProductServiceClient(_SETTINGS)

    products = asyncio.run(client.list_products(face_shape="ROUND", limit=5))

    assert len(products) == 1
    assert products[0].id == "p1"
    assert products[0].score == 0.0
    params = captured_request["url"].params
    assert params["faceShape"] == "ROUND"
    assert params["limit"] == "5"
    assert "frameShape" not in params  # not passed -> omitted, not sent as "None"


def test_list_products_raises_timeout_error_on_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timed out", request=request)

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))
    client = HttpxProductServiceClient(_SETTINGS)

    with pytest.raises(ProductServiceTimeoutError):
        asyncio.run(client.list_products(face_shape="ROUND"))


def test_list_products_raises_unavailable_error_on_5xx_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"message": "internal error"})

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))
    client = HttpxProductServiceClient(_SETTINGS)

    with pytest.raises(ProductServiceUnavailableError):
        asyncio.run(client.list_products(face_shape="ROUND"))


def test_list_products_raises_unavailable_error_when_unreachable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))
    client = HttpxProductServiceClient(_SETTINGS)

    with pytest.raises(ProductServiceUnavailableError):
        asyncio.run(client.list_products(face_shape="ROUND"))


def test_list_products_parses_image_kind_and_defaults_to_gallery(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base_image = {"variantId": None, "isThumbnail": False, "sortOrder": 0}
    item = {
        **_PRODUCT_ITEM,
        "images": [
            {**base_image, "id": "i1", "imageUrl": "http://img/try-on.png", "kind": "TRY_ON"},
            {**base_image, "id": "i2", "imageUrl": "http://img/legacy.png"},  # no `kind`
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"success": True, "message": "Thành công", "data": [item]})

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))
    client = HttpxProductServiceClient(_SETTINGS)

    products = asyncio.run(client.list_products(face_shape="ROUND"))

    images = products[0].images
    assert images[0].kind == "TRY_ON"
    assert images[1].kind == "GALLERY"


def test_list_catalog_reads_every_page_without_face_shape_filter_AC11(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    catalog_item = {
        **_PRODUCT_ITEM,
        "genderTarget": "UNISEX",
        "materialType": "ACETATE",
        "variants": [{"color": "black"}, {"color": "gold"}],
    }
    pages = {
        "1": [catalog_item, {**catalog_item, "id": "p-bad", "materialType": "WOOD"}],
        "2": [{**catalog_item, "id": "p2"}, catalog_item],  # p1 again → de-duplicated
    }
    seen_params: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_params.append(dict(request.url.params))
        page = request.url.params["page"]
        return httpx.Response(
            200,
            json={
                "success": True,
                "message": "Thành công",
                "data": pages[page],
                "meta": {"page": int(page), "limit": 100, "total": 4, "totalPages": 2},
            },
        )

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))
    client = HttpxProductServiceClient(_SETTINGS)

    products = asyncio.run(client.list_catalog())

    assert [p.id for p in products] == ["p1", "p2"]  # unknown materialType skipped
    assert products[0].genderTarget == "UNISEX"
    assert [v.color for v in products[0].variants] == ["black", "gold"]
    assert seen_params == [{"page": "1", "limit": "100"}, {"page": "2", "limit": "100"}]


class _FakeCatalogCache:
    """In-memory `ICatalogCache` (no Redis)."""

    def __init__(self, cached=None) -> None:
        self.value = cached
        self.set_calls: list = []

    async def get(self):
        return self.value

    async def set(self, items) -> None:
        self.set_calls.append(items)
        self.value = items

    async def invalidate(self) -> None:
        self.value = None

    async def ping(self) -> bool:
        return True


def _catalog_handler(calls: list):
    catalog_item = {**_PRODUCT_ITEM, "genderTarget": "UNISEX", "materialType": "ACETATE"}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "success": True,
                "message": "Thành công",
                "data": [catalog_item],
                "meta": {"page": 1, "limit": 100, "total": 1, "totalPages": 1},
            },
        )

    return handler


def test_list_catalog_miss_fetches_and_stores_in_cache_then_hit_skips_http_AC7(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list = []
    _install_mock_transport(monkeypatch, httpx.MockTransport(_catalog_handler(calls)))
    cache = _FakeCatalogCache()
    client = HttpxProductServiceClient(_SETTINGS, cache)

    async def scenario():
        return await client.list_catalog(), await client.list_catalog()

    first, second = asyncio.run(scenario())

    assert [p.id for p in first] == ["p1"]
    assert cache.set_calls == [first]
    assert second == first
    assert len(calls) == 1  # second call served from the cache


def test_list_catalog_cache_hit_makes_no_http_call_AC7(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list = []
    _install_mock_transport(monkeypatch, httpx.MockTransport(_catalog_handler(calls)))
    cached = [object()]
    cache = _FakeCatalogCache(cached=cached)
    client = HttpxProductServiceClient(_SETTINGS, cache)

    result = asyncio.run(client.list_catalog())

    assert result is cached
    assert calls == []
    assert cache.set_calls == []


def test_list_products_forwards_the_current_request_id_AC10(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.request_id import request_id_var

    seen_headers: list = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_headers.append(request.headers.get("X-Request-Id"))
        return httpx.Response(200, json={"success": True, "message": "Thành công", "data": []})

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))
    client = HttpxProductServiceClient(_SETTINGS)

    token = request_id_var.set("req-12345678")
    try:
        asyncio.run(client.list_products(face_shape="ROUND"))
    finally:
        request_id_var.reset(token)

    assert seen_headers == ["req-12345678"]
