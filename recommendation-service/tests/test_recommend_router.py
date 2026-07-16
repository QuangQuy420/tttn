"""HTTP-level tests for `POST /recommend` and `GET /health` (T6) — uses FastAPI's
`TestClient` with the `get_recommendation_service` dependency overridden to a fake
service, so these exercise the router's request validation and error-mapping without a
real product-service call. Mirrors face-processing-service's boundary-only test scope.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.product_client import (
    ProductServiceTimeoutError,
    ProductServiceUnavailableError,
)
from app.routers.recommend import get_recommendation_service
from app.schemas.recommend import RecommendRequest, RecommendResponse

client = TestClient(app)


class _FakeRecommendationService:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error

    async def recommend(self, request: RecommendRequest) -> RecommendResponse:
        if self._error is not None:
            raise self._error
        return self._response


def _override_with(fake_service) -> None:
    app.dependency_overrides[get_recommendation_service] = lambda: fake_service


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_recommend_happy_path_returns_the_service_response() -> None:
    _override_with(_FakeRecommendationService(response=RecommendResponse(items=[])))

    response = client.post("/recommend", json={"faceShape": "OVAL"})

    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_recommend_rejects_an_invalid_face_shape() -> None:
    _override_with(_FakeRecommendationService(response=RecommendResponse(items=[])))

    response = client.post("/recommend", json={"faceShape": "NOT_A_REAL_SHAPE"})

    assert response.status_code == 422


def test_recommend_maps_product_service_timeout_to_504() -> None:
    _override_with(
        _FakeRecommendationService(
            error=ProductServiceTimeoutError("product-service không phản hồi kịp thời.")
        )
    )

    response = client.post("/recommend", json={"faceShape": "OVAL"})

    assert response.status_code == 504
    assert "không phản hồi kịp thời" in response.json()["detail"]


def test_recommend_maps_product_service_unavailable_to_503() -> None:
    _override_with(
        _FakeRecommendationService(
            error=ProductServiceUnavailableError("Không thể kết nối tới product-service.")
        )
    )

    response = client.post("/recommend", json={"faceShape": "OVAL"})

    assert response.status_code == 503
    assert "Không thể kết nối" in response.json()["detail"]
