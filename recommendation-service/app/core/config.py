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


@lru_cache
def get_settings() -> Settings:
    """Cached `Settings` instance — FastAPI `Depends(get_settings)` reuses the same object."""
    return Settings()
