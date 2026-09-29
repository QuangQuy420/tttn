"""Application configuration — pydantic-settings, loaded once from the environment.

Single source of truth for env vars this service needs (mirrors `.env.example`).
Injected via FastAPI `Depends` (see `get_settings` below) rather than imported as a
module-level singleton, so tests can override it. Mirrors
`face-processing-service/app/core/config.py`'s pattern.
"""
from functools import lru_cache

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

    # Shared secret for `/internal/*` endpoints (`X-Internal-Key` header) — same value as
    # `infra/.env` `INTERNAL_API_KEY`.
    INTERNAL_API_KEY: str


@lru_cache
def get_settings() -> Settings:
    """Cached `Settings` instance — FastAPI `Depends(get_settings)` reuses the same object."""
    return Settings()
