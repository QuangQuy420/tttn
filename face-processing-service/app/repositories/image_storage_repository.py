"""S3/MinIO image storage — interface + boto3-backed implementation.

Unlike `product-service`'s public-read `product-images` bucket
(`product-service/src/repositories/image-storage.repository.ts`), this service's
`face-images` bucket stores private personal photos and MUST stay private: no
bucket policy granting public `s3:GetObject` is applied here. Access is only via a
presigned GET URL with a short expiry, generated per upload.
"""
from functools import lru_cache
from typing import Protocol

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

from app.core.config import Settings, get_settings

_PRESIGNED_URL_EXPIRY_SECONDS = 3600  # 1 hour — enough for a client to load the result page


class IImageStorageRepository(Protocol):
    def upload(self, key: str, data: bytes, content_type: str) -> None:
        """Upload raw bytes to the bucket under `key`."""

    def get_presigned_url(self, key: str) -> str:
        """Return a time-limited GET URL for a previously-uploaded object."""

    def delete(self, key: str) -> None:
        """Delete the object stored under `key`."""


class S3ImageStorageRepository:
    """boto3-backed `IImageStorageRepository` against MinIO (S3-compatible).

    Creates the `face-images` bucket on startup if it doesn't already exist, and
    deliberately does NOT attach a public-read bucket policy (private by default —
    this is the key difference from product-service's image storage repo).
    """

    def __init__(self, settings: Settings):
        self._bucket = settings.S3_BUCKET
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=BotoConfig(signature_version="s3v4"),
        )
        # Separate client for presigning only: `S3_ENDPOINT` (e.g. `http://minio:9000`) is a
        # Docker-network-internal hostname a browser can't resolve, so a URL signed against it
        # would fail to load in `web`'s <img> tag. Presigned URLs must be signed against the
        # host the browser will actually hit — `S3_PUBLIC_ENDPOINT` (e.g.
        # `http://localhost:9000`, published to the host in infra/docker-compose.yml). Same
        # credentials/region/signature version, just a different endpoint_url. Mirrors
        # product-service's MINIO_ENDPOINT vs MINIO_PUBLIC_URL split.
        self._presign_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_PUBLIC_ENDPOINT,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=BotoConfig(signature_version="s3v4"),
        )

    def ensure_bucket(self) -> None:
        """Create the bucket if missing. Call once at app startup (see `app/main.py`)."""
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except ClientError:
            self._client.create_bucket(Bucket=self._bucket)
        # No `put_bucket_policy` call here on purpose — bucket stays private (AC8).

    def upload(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
        )

    def get_presigned_url(self, key: str) -> str:
        return self._presign_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=_PRESIGNED_URL_EXPIRY_SECONDS,
        )

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)


@lru_cache
def get_image_storage_repository() -> S3ImageStorageRepository:
    """FastAPI `Depends` provider — single shared repository instance per process."""
    return S3ImageStorageRepository(get_settings())
