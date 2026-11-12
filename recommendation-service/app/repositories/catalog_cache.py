"""Product catalog cache in Redis — cache-aside for `HttpxProductServiceClient.list_catalog`.

One key `rec:catalog:v1` holds the whole catalog as JSON (`CatalogProductDto.model_dump(mode=
"json")` per item) with `EX CATALOG_TTL_SECONDS`. `ProductEventConsumer` deletes it on
`product.updated` / `product.deleted`; the TTL bounds staleness when an event is lost and
for new products (no `product.created` event). See ADR 0005.

The cache is never the source of truth: every error (Redis, decode, anything else) is logged
and treated as a miss (`get`) or ignored (`set` / `invalidate`), so a dead Redis only makes
requests slower. Short timeouts and no client retries, because the miss path runs under the
client's single-flight lock.
"""
import json
import logging
from functools import lru_cache
from typing import Protocol

import redis.asyncio as redis
from redis.asyncio.retry import Retry
from redis.backoff import NoBackoff

from app.core.config import Settings, get_settings
from app.schemas.recommend import CatalogProductDto

logger = logging.getLogger(__name__)

CATALOG_CACHE_KEY = "rec:catalog:v1"
_REDIS_TIMEOUT_SECONDS = 0.5


class ICatalogCache(Protocol):
    invalidation_count: int
    """Process-local count of `mark_invalidated` calls — `list_catalog` compares it before
    and after a fetch so a result loaded across an invalidation is not cached."""

    def mark_invalidated(self) -> None:
        """Bump `invalidation_count`. Synchronous: the consumer calls it before awaiting
        `invalidate`, so a fetch in flight sees it (one uvicorn worker = one process)."""

    async def get(self) -> list[CatalogProductDto] | None:
        """The cached catalog, or None on a miss or any cache error."""

    async def set(self, items: list[CatalogProductDto]) -> None:
        """Store the catalog with the configured TTL; errors are logged, not raised."""

    async def invalidate(self) -> None:
        """Drop the cached catalog; errors are logged, not raised."""

    async def ping(self) -> bool:
        """True when the cache backend answers (readiness check)."""


class _InvalidationCounter:
    """Shared `invalidation_count` / `mark_invalidated` of the `ICatalogCache` classes."""

    invalidation_count: int = 0

    def mark_invalidated(self) -> None:
        self.invalidation_count += 1


class NoopCatalogCache(_InvalidationCounter):
    """`ICatalogCache` that always misses and never touches the network."""

    async def get(self) -> list[CatalogProductDto] | None:
        return None

    async def set(self, items: list[CatalogProductDto]) -> None:
        return None

    async def invalidate(self) -> None:
        return None

    async def ping(self) -> bool:
        return True


class RedisCatalogCache(_InvalidationCounter):
    """Redis-backed `ICatalogCache`."""

    def __init__(self, settings: Settings) -> None:
        self._ttl_seconds = max(1, round(settings.CATALOG_TTL_SECONDS))
        self._client = redis.Redis.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=_REDIS_TIMEOUT_SECONDS,
            socket_timeout=_REDIS_TIMEOUT_SECONDS,
            retry=Retry(NoBackoff(), 0),
        )

    async def get(self) -> list[CatalogProductDto] | None:
        try:
            raw = await self._client.get(CATALOG_CACHE_KEY)
        except Exception as exc:
            logger.warning("Catalog cache read failed, reading product-service: %s", exc)
            return None
        if raw is None:
            return None
        try:
            return [CatalogProductDto.model_validate(item) for item in json.loads(raw)]
        except Exception as exc:
            logger.warning("Catalog cache entry cannot be decoded, ignoring it: %s", exc)
            return None

    async def set(self, items: list[CatalogProductDto]) -> None:
        try:
            value = json.dumps([item.model_dump(mode="json") for item in items])
            await self._client.set(CATALOG_CACHE_KEY, value, ex=self._ttl_seconds)
        except Exception as exc:
            logger.warning("Catalog cache write failed: %s", exc)

    async def invalidate(self) -> None:
        try:
            await self._client.delete(CATALOG_CACHE_KEY)
        except Exception as exc:
            logger.warning(
                "Catalog cache invalidation failed (stale for at most %ss): %s",
                self._ttl_seconds,
                exc,
            )

    async def ping(self) -> bool:
        try:
            return bool(await self._client.ping())
        except Exception as exc:
            logger.warning("Redis ping failed: %s", exc)
            return False

    async def aclose(self) -> None:
        await self._client.aclose()


@lru_cache
def get_catalog_cache() -> RedisCatalogCache:
    """FastAPI `Depends` provider — single shared Redis client per process (also used by
    the product client and the `product-events` consumer)."""
    return RedisCatalogCache(get_settings())
