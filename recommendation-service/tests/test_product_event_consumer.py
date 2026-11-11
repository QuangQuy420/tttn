"""Unit tests for `ProductEventConsumer._handle_message` (plan 14, AC8) — a fake message
object and a fake catalog cache, so no RabbitMQ or Redis is needed. A valid
`{productId, occurredAt}` event clears the catalog cache and is acked; a malformed body is
dead-lettered (`reject(requeue=False)`) without touching the cache.
"""
import asyncio
import json

from app.core.config import Settings
from app.repositories.product_event_consumer import ProductEventConsumer

_SETTINGS = Settings(PRODUCT_SERVICE_URL="http://product-service:3002")


class _FakeCatalogCache:
    def __init__(self) -> None:
        self.invalidations = 0

    async def invalidate(self) -> None:
        self.invalidations += 1


class _FakeMessage:
    def __init__(self, body: bytes, routing_key: str = "product.updated") -> None:
        self.body = body
        self.routing_key = routing_key
        self.acked = False
        self.rejected_with: dict | None = None

    async def ack(self) -> None:
        self.acked = True

    async def reject(self, requeue: bool = False) -> None:
        self.rejected_with = {"requeue": requeue}


def test_valid_product_event_invalidates_the_catalog_cache_and_acks_AC8() -> None:
    cache = _FakeCatalogCache()
    consumer = ProductEventConsumer(_SETTINGS, cache)
    message = _FakeMessage(
        json.dumps({"productId": "p1", "occurredAt": "2026-09-29T10:00:00Z"}).encode(),
        routing_key="product.deleted",
    )

    asyncio.run(consumer._handle_message(message))

    assert cache.invalidations == 1
    assert message.acked is True
    assert message.rejected_with is None


def test_malformed_product_event_is_rejected_without_requeue_AC8() -> None:
    cache = _FakeCatalogCache()
    consumer = ProductEventConsumer(_SETTINGS, cache)
    message = _FakeMessage(b"not json")

    asyncio.run(consumer._handle_message(message))

    assert message.rejected_with == {"requeue": False}
    assert message.acked is False
    assert cache.invalidations == 0
