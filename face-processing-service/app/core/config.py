"""Application configuration — pydantic-settings, loaded once from the environment.

Single source of truth for env vars this service needs (mirrors `.env.example`).
Injected via FastAPI `Depends` (see `get_settings` below) rather than imported as a
module-level singleton, so tests can override it.
"""
from functools import lru_cache
from typing import Literal

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

    # Face-shape classifier: "ml" = trained model under models/face_shape/<version>/,
    # "rule" = the old threshold rules (fallback, never touches the model folder).
    FACE_SHAPE_CLASSIFIER: Literal["ml", "rule"] = "ml"
    FACE_SHAPE_MODEL_VERSION: str = "fs-20260930-svm"
    # Photos with |yaw| above this (degrees) are rejected — the face is turned sideways.
    FACE_MAX_YAW_DEG: float = 25.0
    # Photos whose cheekbone width (234 <-> 454, pixels) is below this are rejected — same
    # `min_cheek_px` filter as the training data (ml/face-shape/config.yaml).
    FACE_MIN_CHEEK_PX: float = 80.0

    # Shared secret for `/internal/*` endpoints (`X-Internal-Key` header) — same value as
    # `infra/.env` `INTERNAL_API_KEY`.
    INTERNAL_API_KEY: str


@lru_cache
def get_settings() -> Settings:
    """Cached `Settings` instance — FastAPI `Depends(get_settings)` reuses the same object."""
    return Settings()
