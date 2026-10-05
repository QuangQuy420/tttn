"""Router tests for the shared response envelope: `GET /analyses` pagination (AC3) and
the error envelope on a 404 (AC2); plan 08: the new history fields, the head-pose 400 and
`/internal/users/{userId}/latest-analysis`.

No real DB or MinIO — `get_face_analysis_service` is overridden with a real
`FaceAnalysisService` built on in-memory fakes.
"""
import datetime as dt
import os
import uuid
from collections.abc import Iterator
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.db.models import FaceShape
from app.main import app
from app.services.face_analysis_service import FaceAnalysisService, get_face_analysis_service
from app.services.face_classifier import RuleBasedClassifier
from app.services.face_shape_service import FacePoseError

USER_ID = uuid.uuid4()

_MEASUREMENTS = {
    "face_length": 0.4,
    "forehead_width": 0.3,
    "cheekbone_width": 0.35,
    "jaw_width": 0.3,
    "length_to_width_ratio": 1.1,
    "cheekbone_to_jaw_ratio": 0.85,
    "forehead_to_jaw_ratio": 1.0,
}


def _row(user_id: uuid.UUID) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=user_id,
        face_shape=FaceShape.OVAL,
        measurements=_MEASUREMENTS,
        confidence=0.8,
        s3_key=f"{uuid.uuid4()}.jpg",
        created_at=dt.datetime(2026, 9, 30, 10, 0, tzinfo=dt.timezone.utc),
        probabilities={"OVAL": 0.7, "ROUND": 0.1, "SQUARE": 0.05, "HEART": 0.05, "DIAMOND": 0.05, "OBLONG": 0.05},
        method="ml",
        model_version="fs-20261005-svm",
    )


class FakeFaceAnalysisRepository:
    """In-memory repo; rows are kept newest first."""

    def __init__(self, rows: list[SimpleNamespace]) -> None:
        self.rows = rows

    async def list_by_user(self, user_id: uuid.UUID, offset: int, limit: int):
        mine = [r for r in self.rows if r.user_id == user_id]
        return mine[offset : offset + limit]

    async def count_by_user(self, user_id: uuid.UUID) -> int:
        return sum(1 for r in self.rows if r.user_id == user_id)

    async def get_latest_by_user(self, user_id: uuid.UUID):
        return next((r for r in self.rows if r.user_id == user_id), None)

    async def get_by_id(self, id: uuid.UUID):
        return next((r for r in self.rows if r.id == id), None)

    async def delete(self, id: uuid.UUID, user_id: uuid.UUID) -> None:
        self.rows = [r for r in self.rows if r.id != id]


class FakeImageStorage:
    def get_presigned_url(self, key: str) -> str:
        return f"http://minio/{key}"

    def delete(self, key: str) -> None:
        pass


@pytest.fixture
def rows() -> list[SimpleNamespace]:
    return [_row(USER_ID) for _ in range(3)]


@pytest.fixture
def client(rows: list[SimpleNamespace]) -> Iterator[TestClient]:
    service = FaceAnalysisService(
        FakeImageStorage(), FakeFaceAnalysisRepository(rows), RuleBasedClassifier(), 25.0
    )
    app.dependency_overrides[get_face_analysis_service] = lambda: service
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def test_list_analyses_returns_requested_page_with_meta(
    client: TestClient, rows: list[SimpleNamespace]
) -> None:
    response = client.get(
        "/analyses", params={"page": 2, "limit": 1}, headers={"X-User-Id": str(USER_ID)}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert [item["id"] for item in body["data"]] == [str(rows[1].id)]
    assert body["meta"] == {"page": 2, "limit": 1, "total": 3, "totalPages": 3}


def test_list_analyses_returns_model_fields(client: TestClient) -> None:
    response = client.get("/analyses", headers={"X-User-Id": str(USER_ID)})

    item = response.json()["data"][0]
    assert item["method"] == "ml"
    assert item["modelVersion"] == "fs-20261005-svm"
    assert item["probabilities"]["OVAL"] == 0.7
    assert item["quality"] is None


def test_delete_unknown_analysis_returns_not_found_envelope(client: TestClient) -> None:
    response = client.delete(f"/analyses/{uuid.uuid4()}", headers={"X-User-Id": str(USER_ID)})

    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["message"] == "Không tìm thấy lịch sử phân tích."
    assert body["error"]["code"] == "NOT_FOUND"


class _PoseRejectingService:
    async def analyze_and_store(self, **kwargs):
        raise FacePoseError(
            "Khuôn mặt đang quay nghiêng quá nhiều — vui lòng nhìn thẳng vào camera và chụp lại."
        )


def test_analyze_turned_face_returns_bad_request_with_vietnamese_hint() -> None:
    app.dependency_overrides[get_face_analysis_service] = lambda: _PoseRejectingService()
    try:
        response = TestClient(app).post(
            "/analyze",
            files={"file": ("face.jpg", b"fake-bytes", "image/jpeg")},
            headers={"X-User-Id": str(USER_ID)},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "BAD_REQUEST"
    assert "nhìn thẳng vào camera" in body["message"]


_INTERNAL_KEY = {"X-Internal-Key": os.environ["INTERNAL_API_KEY"]}


def test_latest_analysis_returns_newest_row(
    client: TestClient, rows: list[SimpleNamespace]
) -> None:
    response = client.get(f"/internal/users/{USER_ID}/latest-analysis", headers=_INTERNAL_KEY)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["analysisId"] == str(rows[0].id)
    assert data["userId"] == str(USER_ID)
    assert data["faceShape"] == "OVAL"
    assert data["method"] == "ml"
    assert data["modelVersion"] == "fs-20261005-svm"
    assert data["probabilities"]["OVAL"] == 0.7


def test_latest_analysis_without_key_is_forbidden(client: TestClient) -> None:
    response = client.get(f"/internal/users/{USER_ID}/latest-analysis")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_latest_analysis_for_user_without_analyses_is_not_found(client: TestClient) -> None:
    response = client.get(f"/internal/users/{uuid.uuid4()}/latest-analysis", headers=_INTERNAL_KEY)

    assert response.status_code == 404
    assert response.json()["message"] == "Người dùng chưa có kết quả phân tích khuôn mặt."
