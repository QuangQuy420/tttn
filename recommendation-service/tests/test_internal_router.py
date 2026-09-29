"""HTTP-level tests for `/internal/*` — `TestClient` with `get_interaction_repository`
overridden to a fake, so these exercise the `X-Internal-Key` gate, the envelope shape and
query validation without a real Postgres. `INTERNAL_API_KEY` comes from `conftest.py`.
"""
import datetime as dt
import os
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.db.models import BehaviorEventType
from app.main import app
from app.repositories.interaction_repository import get_interaction_repository

client = TestClient(app)

_KEY = {"X-Internal-Key": os.environ["INTERNAL_API_KEY"]}
_USER_ID = "1f2e3d4c-5b6a-4789-8a7b-6c5d4e3f2a10"
_ROW = SimpleNamespace(
    event_id=UUID("7b6f1c1e-3f0a-4c55-9d1f-0a4f3c2b1a11"),
    event_type=BehaviorEventType.TRY_ON,
    product_id=UUID("9a8b7c6d-5e4f-4321-8765-43210fedcba9"),
    occurred_at=dt.datetime(2026, 9, 29, 10, 0, tzinfo=dt.timezone.utc),
    source="web",
    context={"durationMs": 1200},
)


class _FakeInteractionRepository:
    def __init__(self):
        self.list_args = None

    async def list_by_user(self, user_id, since, limit):
        self.list_args = (user_id, since, limit)
        return [_ROW]

    async def count_events_by_day(self, days):
        return [(dt.date(2026, 9, 29), BehaviorEventType.VIEW, 3)]


@pytest.fixture
def repository():
    fake = _FakeInteractionRepository()
    app.dependency_overrides[get_interaction_repository] = lambda: fake
    yield fake
    app.dependency_overrides.clear()


@pytest.mark.parametrize("headers", [{}, {"X-Internal-Key": "wrong"}], ids=["missing", "wrong"])
def test_internal_endpoint_without_valid_key_is_forbidden(repository, headers) -> None:
    response = client.get(f"/internal/users/{_USER_ID}/interactions", headers=headers)

    assert response.status_code == 403
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "FORBIDDEN"
    assert repository.list_args is None


def test_list_user_interactions_returns_history(repository) -> None:
    response = client.get(
        f"/internal/users/{_USER_ID}/interactions",
        params={"since": "2026-09-01T00:00:00Z", "limit": 50},
        headers=_KEY,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["items"] == [
        {
            "eventId": "7b6f1c1e-3f0a-4c55-9d1f-0a4f3c2b1a11",
            "eventType": "TRY_ON",
            "productId": "9a8b7c6d-5e4f-4321-8765-43210fedcba9",
            "occurredAt": "2026-09-29T10:00:00Z",
            "source": "web",
            "context": {"durationMs": 1200},
        }
    ]
    user_id, since, limit = repository.list_args
    assert (str(user_id), limit) == (_USER_ID, 50)
    assert since == dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc)


def test_list_user_interactions_limit_over_max_is_validation_error(repository) -> None:
    response = client.get(
        f"/internal/users/{_USER_ID}/interactions", params={"limit": 1001}, headers=_KEY
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"


def test_event_stats_returns_counts_per_day_and_type(repository) -> None:
    response = client.get("/internal/stats/events", params={"days": 7}, headers=_KEY)

    assert response.status_code == 200
    assert response.json()["data"] == {
        "days": 7,
        "items": [{"date": "2026-09-29", "eventType": "VIEW", "count": 3}],
    }
