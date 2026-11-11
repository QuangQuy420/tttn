"""Plan 15 (admin AI analytics): `AdminService` (model info + face-shape distribution) and the
`/admin/*` router (internal-key gate, 400 on a bad date range).

No real DB — the repository and the classifier are small in-memory fakes; the router tests
override `get_admin_service` with a real `AdminService` built on those fakes.
"""
import asyncio
import datetime as dt
import os
from collections.abc import Iterator
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.db.models import FaceShape
from app.main import app
from app.services.admin_service import AdminService, get_admin_service
from app.services.face_classifier import RuleBasedClassifier

_INTERNAL_KEY = {"X-Internal-Key": os.environ["INTERNAL_API_KEY"]}
_VN = ZoneInfo("Asia/Ho_Chi_Minh")

_CARD = {
    "version": "v-test-svm",
    "created_at": "2026-10-05T10:00:00Z",
    "algorithm": "svm",
    "classes": [shape.value for shape in FaceShape],
    "metrics": {
        "test_accuracy": 0.54,
        "test_macro_f1": 0.49,
        "per_class": {"OVAL": {"precision": 0.6, "recall": 0.5, "f1": 0.55, "support": 20}},
    },
}


class FakeFaceAnalysisRepository:
    """Returns fixed per-shape counts and records the `[start, end)` it was asked for."""

    def __init__(self, counts: dict[FaceShape, int]) -> None:
        self.counts = counts
        self.calls: list[tuple[dt.datetime, dt.datetime]] = []

    async def count_by_face_shape(self, start: dt.datetime, end: dt.datetime):
        self.calls.append((start, end))
        return self.counts


def _ml_classifier() -> SimpleNamespace:
    return SimpleNamespace(name="ml", version=_CARD["version"], model_card=_CARD)


# --- AdminService ---------------------------------------------------------------------


def test_model_info_maps_the_ml_model_card_ac1() -> None:
    info = AdminService(FakeFaceAnalysisRepository({}), _ml_classifier()).model_info()

    assert info.method == "ml"
    assert info.modelVersion == "v-test-svm"
    assert info.algorithm == "svm"
    assert info.createdAt == "2026-10-05T10:00:00Z"
    assert info.metrics.accuracy == 0.54
    assert info.metrics.macroF1 == 0.49
    assert info.metrics.perClass["OVAL"].f1 == 0.55


def test_model_info_in_rule_mode_reports_rule_without_metrics_ac3() -> None:
    info = AdminService(FakeFaceAnalysisRepository({}), RuleBasedClassifier()).model_info()

    assert info.method == "rule"
    assert info.modelVersion == "rule-v0"
    assert info.metrics is None
    assert info.algorithm is None


def test_distribution_pads_to_six_shapes_over_vietnam_days_ac7() -> None:
    repo = FakeFaceAnalysisRepository({FaceShape.OVAL: 3, FaceShape.ROUND: 1})
    service = AdminService(repo, RuleBasedClassifier())

    result = asyncio.run(service.face_shape_distribution(dt.date(2026, 9, 1), dt.date(2026, 9, 30)))

    assert [(item.faceShape, item.count) for item in result.items] == [
        (FaceShape.ROUND, 1),
        (FaceShape.SQUARE, 0),
        (FaceShape.OVAL, 3),
        (FaceShape.HEART, 0),
        (FaceShape.DIAMOND, 0),
        (FaceShape.OBLONG, 0),
    ]
    assert result.total == 4
    assert (result.date_from, result.date_to) == (dt.date(2026, 9, 1), dt.date(2026, 9, 30))
    # Inclusive `to` → half-open `[from 00:00, to+1 00:00)` in Asia/Ho_Chi_Minh.
    assert repo.calls == [
        (dt.datetime(2026, 9, 1, tzinfo=_VN), dt.datetime(2026, 10, 1, tzinfo=_VN))
    ]


def test_distribution_with_no_data_returns_six_zero_items_ac10() -> None:
    service = AdminService(FakeFaceAnalysisRepository({}), RuleBasedClassifier())

    result = asyncio.run(service.face_shape_distribution(dt.date(2026, 9, 1), dt.date(2026, 9, 30)))

    assert result.total == 0
    assert [item.count for item in result.items] == [0] * 6


# --- /admin router --------------------------------------------------------------------


@pytest.fixture
def repo() -> FakeFaceAnalysisRepository:
    return FakeFaceAnalysisRepository({FaceShape.HEART: 2})


@pytest.fixture
def client(repo: FakeFaceAnalysisRepository) -> Iterator[TestClient]:
    service = AdminService(repo, _ml_classifier())
    app.dependency_overrides[get_admin_service] = lambda: service
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_get_model_info_returns_envelope_ac1(client: TestClient) -> None:
    response = client.get("/admin/model-info", headers=_INTERNAL_KEY)

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["method"] == "ml"
    assert body["data"]["modelVersion"] == "v-test-svm"
    assert body["data"]["metrics"]["accuracy"] == 0.54
    assert body["data"]["metrics"]["macroF1"] == 0.49


def test_get_face_shapes_serializes_from_to_and_items_ac7(client: TestClient) -> None:
    response = client.get(
        "/admin/analytics/face-shapes",
        params={"from": "2026-09-01", "to": "2026-09-30"},
        headers=_INTERNAL_KEY,
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["from"] == "2026-09-01"
    assert data["to"] == "2026-09-30"
    assert data["total"] == 2
    assert len(data["items"]) == 6
    assert {"faceShape": "HEART", "count": 2} in data["items"]


@pytest.mark.parametrize("headers", [{}, {"X-Internal-Key": "wrong-key"}])
def test_admin_routes_without_valid_internal_key_return_403_ac9(
    client: TestClient, headers: dict[str, str]
) -> None:
    for path in ("/admin/model-info", "/admin/analytics/face-shapes"):
        response = client.get(path, headers=headers)

        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({"from": "2026-01-01", "to": "2026-04-30"}, "Khoảng thời gian tối đa là 90 ngày"),
        ({"from": "2026-09-30", "to": "2026-09-01"}, "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"),
    ],
)
def test_get_face_shapes_with_bad_range_returns_400_vietnamese_ac11(
    client: TestClient, repo: FakeFaceAnalysisRepository, params: dict[str, str], message: str
) -> None:
    response = client.get("/admin/analytics/face-shapes", params=params, headers=_INTERNAL_KEY)

    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["message"] == message
    assert repo.calls == []
