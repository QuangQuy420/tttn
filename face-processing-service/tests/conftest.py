"""Test-wide env defaults — set before any `app` module builds `Settings`.

`S3_*`, `DATABASE_URL` and `INTERNAL_API_KEY` are required settings with no default; CI has
no `.env`, so without these `get_settings()` fails. Real env vars still win.
"""
import os

os.environ.setdefault("S3_ENDPOINT", "http://minio:9000")
os.environ.setdefault("S3_PUBLIC_ENDPOINT", "http://localhost:9000")
os.environ.setdefault("S3_ACCESS_KEY", "test-access-key")
os.environ.setdefault("S3_SECRET_KEY", "test-secret-key")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://app:app@localhost:5432/face_db")
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")
