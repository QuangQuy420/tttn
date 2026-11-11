"""Single-value in-process cache with a time-to-live (global product stats).

Per process, not shared between replicas. The product catalog lives in Redis instead (see
app/repositories/catalog_cache.py).
"""
import time
from typing import Generic, TypeVar

T = TypeVar("T")


class TtlCache(Generic[T]):
    def __init__(self) -> None:
        self._value: T | None = None
        self._expires_at = 0.0

    def get(self) -> T | None:
        """The cached value, or None when empty or expired."""
        if self._value is None or time.monotonic() >= self._expires_at:
            return None
        return self._value

    def set(self, value: T, ttl_seconds: float) -> None:
        self._value = value
        self._expires_at = time.monotonic() + ttl_seconds
