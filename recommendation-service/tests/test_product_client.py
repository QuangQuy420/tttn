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
        return httpx.Response(200, json={"items": [_PRODUCT_ITEM]})

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
