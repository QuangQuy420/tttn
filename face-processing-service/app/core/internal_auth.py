"""`X-Internal-Key` gate for `/internal/*` endpoints (service-to-service only).

The header is declared optional on purpose: a required `Header(...)` would fail FastAPI
validation first and hit the 400 `VALIDATION_FAILED` handler instead of returning 403.
"""
import hmac

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings


def require_internal_key(
    x_internal_key: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """FastAPI dependency — 403 (`FORBIDDEN` envelope) unless the header matches
    `INTERNAL_API_KEY`. An empty configured key rejects every call."""
    expected = settings.INTERNAL_API_KEY
    # Compare bytes, not str: `compare_digest` raises TypeError on non-ASCII str input.
    if (
        not x_internal_key
        or not expected
        or not hmac.compare_digest(x_internal_key.encode(), expected.encode())
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không có quyền truy cập nội bộ",
        )
