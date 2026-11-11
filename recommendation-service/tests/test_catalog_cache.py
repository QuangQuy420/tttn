"""Unit tests for `RedisCatalogCache` (plan 14, AC7) — the Redis client is swapped for a
small in-memory fake, so no Redis server is needed. Covers the JSON round-trip of
`CatalogProductDto` items with the configured TTL and the "Redis error → miss" fallback.
"""
import asyncio

from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.config import Settings
from app.repositories.catalog_cache import CATALOG_CACHE_KEY, RedisCatalogCache
from app.schemas.recommend import CatalogProductDto

_SETTINGS = Settings(
    PRODUCT_SERVICE_URL="http://product-service:3002",
    REDIS_URL="redis://localhost:6379/0",
    CATALOG_TTL_SECONDS=300.0,
)

_PRODUCT = CatalogProductDto(
    id="p1",
    sku="SKU-1",
    name="Test Frame",
    slug="test-frame",
    frameShape="SQUARE",
    genderTarget="UNISEX",
    materialType="ACETATE",
    basePrice=100.0,
    brand={"id": "b1", "name": "Brand", "logoUrl": None},
    images=[],
    faceShapes=["ROUND"],
    variants=[{"color": "black"}],
)


class _FakeRedis:
    """Async subset of `redis.asyncio.Redis` used by `RedisCatalogCache`."""

    def __init__(self, error: Exception | None = None) -> None:
        self.store: dict[str, str] = {}
        self.expiry: dict[str, int] = {}
        self._error = error

    async def get(self, key: str):
        if self._error is not None:
            raise self._error
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        if self._error is not None:
            raise self._error
        self.store[key] = value
        self.expiry[key] = ex

    async def delete(self, key: str) -> None:
        if self._error is not None:
            raise self._error
        self.store.pop(key, None)


def _cache_with(fake: _FakeRedis) -> RedisCatalogCache:
    cache = RedisCatalogCache(_SETTINGS)  # `from_url` does not connect
    cache._client = fake
    return cache


def test_set_then_get_round_trips_catalog_products_with_ttl_AC7() -> None:
    fake = _FakeRedis()
    cache = _cache_with(fake)

    async def scenario():
        before = await cache.get()
        await cache.set([_PRODUCT])
        return before, await cache.get()

    before, after = asyncio.run(scenario())

    assert before is None
    assert after == [_PRODUCT]
    assert fake.expiry[CATALOG_CACHE_KEY] == 300


def test_get_returns_none_when_redis_fails_AC7() -> None:
    cache = _cache_with(_FakeRedis(error=RedisConnectionError("redis down")))

    assert asyncio.run(cache.get()) is None
