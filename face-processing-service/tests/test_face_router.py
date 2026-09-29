"""Router tests for the shared response envelope: `GET /analyses` pagination (AC3) and
the error envelope on a 404 (AC2).

No real DB or MinIO — `get_face_analysis_service` is overridden with a real
`FaceAnalysisService` built on in-memory fakes.
"""
import uuid
from collections.abc import Iterator
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.db.models import FaceShape
from app.main import app
from app.services.face_analysis_service import FaceAnalysisService, get_face_analysis_service

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
    service = FaceAnalysisService(FakeImageStorage(), FakeFaceAnalysisRepository(rows))
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


def test_delete_unknown_analysis_returns_not_found_envelope(client: TestClient) -> None:
    response = client.delete(f"/analyses/{uuid.uuid4()}", headers={"X-User-Id": str(USER_ID)})

    assert response.status_code == 404
    body = response.json()
    assert body["success"] is False
    assert body["message"] == "Không tìm thấy lịch sử phân tích."
    assert body["error"]["code"] == "NOT_FOUND"
