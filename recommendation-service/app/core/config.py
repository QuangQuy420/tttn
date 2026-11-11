"""Application configuration — pydantic-settings, loaded once from the environment.

Single source of truth for env vars this service needs (mirrors `.env.example`).
Injected via FastAPI `Depends` (see `get_settings` below) rather than imported as a
module-level singleton, so tests can override it. Mirrors
`face-processing-service/app/core/config.py`'s pattern.
"""
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PORT: int = 8000

    # product-service REST client (see app/repositories/product_client.py)
    PRODUCT_SERVICE_URL: str
    # HTTP timeout for calls to product-service, in seconds — kept short so a slow/unreachable
    # downstream fails fast instead of hanging the request (coder.md §3: handle
    # timeouts/unreachability explicitly, don't let it become an unhandled 500).
    PRODUCT_SERVICE_TIMEOUT_SECONDS: float = 5.0

    # recommendation_db (behavior event store, see app/db/) — async URL, e.g.
    # `postgresql+asyncpg://app:app@postgres:5432/recommendation_db`.
    DATABASE_URL: str

    # RabbitMQ behavior-events consumer (see app/repositories/behavior_event_consumer.py).
    RABBITMQ_URL: str
    # Tests set this to False so `with TestClient(app)` never tries to reach RabbitMQ.
    BEHAVIOR_CONSUMER_ENABLED: bool = True
    # Quorum-queue `x-delivery-limit` — a message redelivered this many times is
    # dead-lettered to `behavior-events.dlq`. Changing it later means deleting the queue.
    BEHAVIOR_QUEUE_DELIVERY_LIMIT: int = 10
    BEHAVIOR_PREFETCH: int = 20
    # RabbitMQ `product-events` consumer (see app/repositories/product_event_consumer.py) —
    # invalidates the Redis catalog cache on `product.updated` / `product.deleted`. Tests set
    # it to False like the behavior flag. Reuses BEHAVIOR_PREFETCH / BEHAVIOR_QUEUE_DELIVERY_LIMIT.
    PRODUCT_CONSUMER_ENABLED: bool = True

    # Redis holding the product catalog cache (see app/repositories/catalog_cache.py). When
    # Redis is down the cache is bypassed (every request reads product-service).
    REDIS_URL: str = "redis://redis:6379/0"

    # Shared secret for `/internal/*` endpoints (`X-Internal-Key` header) — same value as
    # `infra/.env` `INTERNAL_API_KEY`.
    INTERNAL_API_KEY: str

    # Hybrid ranking: `final = RANK_ALPHA * preference + RANK_BETA * faceFit`, where
    # `preference` is the model score on the `PREFERENCE_NORM` scale (see app/ml/hybrid.py).
    # The response reports the effective weights (β=0 without a face analysis, α=0 in
    # legacy mode).
    RANK_ALPHA: float = 0.6
    RANK_BETA: float = 0.4
    # `none` = calibrated preference as is; `rank` = rank over the candidate list in [0, 1].
    # Defaults `rank`, 0.6 / 0.4 are a product choice (keep face shape relevant), not the
    # val-selected config (`none`, 0.995 / 0.005) — see ml/recommendation/reports/hybrid/SUMMARY.md.
    PREFERENCE_NORM: Literal["none", "rank"] = "rank"
    # Folder under `models/preference/` to load at startup (see app/core/model_registry.py).
    # Empty = legacy mode: no model is loaded, preference = popularity, α=0.
    PREFERENCE_MODEL_VERSION: str = ""

    # face-processing-service internal API (latest / chosen face analysis of a user) — the
    # default keeps CI (no `.env`) importable.
    FACE_PROCESSING_SERVICE_URL: str = "http://face-processing-service:8000"
    FACE_PROCESSING_TIMEOUT_SECONDS: float = 2.0

    # Cache lifetime for the product catalog (Redis, also invalidated by `product-events`) and
    # the global product stats (in-process). Bounds staleness when an event is lost and for
    # newly created products (product-service publishes no `product.created`).
    CATALOG_TTL_SECONDS: float = 300.0
    # Popularity of the global product stats replays only the events of the last
    # STATS_WINDOW_DAYS days (older ones have decayed away); view/purchase counts and the
    # first event date stay all-time (one aggregate query) like training.
    STATS_WINDOW_DAYS: int = 180

    # Diversity caps on the top-10 of `GET /recommendations/for-you`.
    MAX_PER_FRAME_SHAPE: int = 3
    MAX_PER_BRAND: int = 3


@lru_cache
def get_settings() -> Settings:
    """Cached `Settings` instance — FastAPI `Depends(get_settings)` reuses the same object."""
    return Settings()
