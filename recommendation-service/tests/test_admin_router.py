"""HTTP-level tests for `/admin/*` (plan 15) — `TestClient` with `get_admin_service`
overridden to a real `AdminService` over fakes, so these exercise the `X-Internal-Key`
gate, the envelope + `from`/`to` aliases and the 400 mapping without Postgres or
product-service. `INTERNAL_API_KEY` comes from `conftest.py`.
"""
import os
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.models import BehaviorEventType
from app.main import app
from app.services.admin_service import AdminService, get_admin_service

client = TestClient(app)

_KEY = {"X-Internal-Key": os.environ["INTERNAL_API_KEY"]}
_PRODUCT = UUID("00000000-0000-0000-0000-00000000000a")
_SETTINGS = Settings(RANK_ALPHA=0.6, RANK_BETA=0.4, PREFERENCE_NORM="rank")


class _FakeInteractionRepository:
    def __init__(self):
        self.calls: list[str] = []

    async def daily_counts(self, start, end, source):
        self.calls.append("daily_counts")
        return []

    async def distinct_users_by_type(self, start, end, source):
        self.calls.append("distinct_users_by_type")
        return {BehaviorEventType.VIEW: 4, BehaviorEventType.TRY_ON: 2}

    async def top_products(self, event_type, start, end, source, limit):
        self.calls.append("top_products")
        return [(_PRODUCT, 3)]


class _FakeProductClient:
    async def list_catalog(self):
        return []


@pytest.fixture
def repository():
    fake = _FakeInteractionRepository()
    service = AdminService(fake, _FakeProductClient(), _SETTINGS, None)
    app.dependency_overrides[get_admin_service] = lambda: service
    yield fake
    app.dependency_overrides.clear()


@pytest.mark.parametrize("headers", [{}, {"X-Internal-Key": "wrong"}], ids=["missing", "wrong"])
@pytest.mark.parametrize(
    "path",
    [
        "/admin/model-info",
        "/admin/analytics/events/daily",
        "/admin/analytics/funnel",
        "/admin/analytics/top-products",
    ],
)
def test_admin_endpoint_without_valid_key_is_forbidden_ac9(repository, headers, path) -> None:
    response = client.get(path, headers=headers)

    assert response.status_code == 403
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "FORBIDDEN"
    assert repository.calls == []


def test_model_info_in_legacy_mode_returns_not_loaded_ac2_ac3(repository) -> None:
    response = client.get("/admin/model-info", headers=_KEY)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == {
        "loaded": False,
        "version": None,
        "algorithm": None,
        "objective": None,
        "createdAt": None,
        "metrics": None,
        "alpha": 0.6,
        "beta": 0.4,
        "preferenceNorm": "rank",
    }


def test_daily_events_empty_range_returns_zero_filled_days_with_aliases_ac4_ac10(
    repository,
) -> None:
    response = client.get(
        "/admin/analytics/events/daily",
        params={"from": "2026-09-01", "to": "2026-09-02"},
        headers=_KEY,
    )

    assert response.status_code == 200
    zeros = {"VIEW": 0, "TRY_ON": 0, "LIKE": 0, "ADD_TO_CART": 0, "PURCHASE": 0}
    assert response.json()["data"] == {
        "from": "2026-09-01",
        "to": "2026-09-02",
        "source": "real",
        "days": [
            {"date": "2026-09-01", "counts": zeros},
            {"date": "2026-09-02", "counts": zeros},
        ],
    }


def test_funnel_returns_five_steps_ac5(repository) -> None:
    response = client.get(
        "/admin/analytics/funnel",
        params={"from": "2026-09-01", "to": "2026-09-30", "source": "all"},
        headers=_KEY,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert (data["from"], data["to"], data["source"]) == ("2026-09-01", "2026-09-30", "all")
    assert data["steps"] == [
        {"eventType": "VIEW", "users": 4, "conversionFromPrevious": None},
        {"eventType": "TRY_ON", "users": 2, "conversionFromPrevious": 0.5},
        {"eventType": "LIKE", "users": 0, "conversionFromPrevious": 0.0},
        {"eventType": "ADD_TO_CART", "users": 0, "conversionFromPrevious": None},
        {"eventType": "PURCHASE", "users": 0, "conversionFromPrevious": None},
    ]


def test_top_products_returns_items_ac6(repository) -> None:
    response = client.get(
        "/admin/analytics/top-products",
        params={"from": "2026-09-01", "to": "2026-09-30", "eventType": "PURCHASE", "limit": 5},
        headers=_KEY,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["eventType"] == "PURCHASE"
    assert data["items"] == [
        {
            "productId": str(_PRODUCT),
            "count": 3,
            "name": None,
            "slug": None,
            "thumbnailUrl": None,
        }
    ]


def test_top_products_unlike_event_type_is_validation_error(repository) -> None:
    response = client.get(
        "/admin/analytics/top-products", params={"eventType": "UNLIKE"}, headers=_KEY
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert repository.calls == []


@pytest.mark.parametrize(
    ("params", "message"),
    [
        (
            {"from": "2026-09-02", "to": "2026-09-01"},
            "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc",
        ),
        ({"from": "2026-06-01", "to": "2026-08-30"}, "Khoảng thời gian tối đa là 90 ngày"),
    ],
    ids=["from-after-to", "over-90-days"],
)
def test_invalid_range_is_bad_request_with_vietnamese_message_ac11(
    repository, params, message
) -> None:
    response = client.get("/admin/analytics/funnel", params=params, headers=_KEY)

    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["message"] == message
    assert body["error"]["code"] == "BAD_REQUEST"
    assert repository.calls == []
