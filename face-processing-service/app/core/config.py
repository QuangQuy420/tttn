"""Application configuration — pydantic-settings, loaded once from the environment.

Single source of truth for env vars this service needs (mirrors `.env.example`).
Injected via FastAPI `Depends` (see `get_settings` below) rather than imported as a
module-level singleton, so tests can override it.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PORT: int = 8000

    # S3 (local = MinIO, S3-compatible; see .env.example)
    S3_ENDPOINT: str
    # Browser-facing endpoint used only for signing presigned GET URLs — `S3_ENDPOINT`'s
    # hostname (e.g. `minio`) is a Docker-network-internal name a browser can't resolve.
    S3_PUBLIC_ENDPOINT: str
    S3_BUCKET: str = "face-images"
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_REGION: str = "us-east-1"

    # Postgres (async SQLAlchemy engine, `postgresql+asyncpg://` scheme)
    DATABASE_URL: str


@lru_cache
def get_settings() -> Settings:
    """Cached `Settings` instance — FastAPI `Depends(get_settings)` reuses the same object."""
    return Settings()
