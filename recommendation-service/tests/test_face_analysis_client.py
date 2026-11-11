"""Unit tests for `HttpxFaceAnalysisClient` — face-processing-service's internal API
(plan 11, T5). `httpx.MockTransport` swapped in via a monkeypatched `httpx.AsyncClient`,
same as `test_product_client.py`; no real network.
"""
import asyncio
from uuid import UUID

import httpx
import pytest

from app.core.config import Settings
from app.repositories.face_analysis_client import HttpxFaceAnalysisClient
from app.schemas.recommend import FaceShape

_SETTINGS = Settings(
    FACE_PROCESSING_SERVICE_URL="http://face-processing-service:8000",
    INTERNAL_API_KEY="test-internal-key",
)
_USER_ID = UUID("11111111-1111-1111-1111-111111111111")
_ANALYSIS_ID = UUID("22222222-2222-2222-2222-222222222222")


def _install_mock_transport(monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport) -> None:
    real_async_client = httpx.AsyncClient

    class _PatchedAsyncClient(real_async_client):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(
        "app.repositories.face_analysis_client.httpx.AsyncClient", _PatchedAsyncClient
    )


def test_get_by_id_sends_the_internal_key_and_parses_probabilities_AC7(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return httpx.Response(
            200,
            json={
                "success": True,
                "message": "Thành công",
                "data": {
                    "analysisId": str(_ANALYSIS_ID),
                    "userId": str(_USER_ID),
                    "faceShape": "OVAL",
                    "probabilities": {"OVAL": 0.7, "ROUND": 0.3},
                    "method": "model",
                    "modelVersion": "fs-v1",
                    "createdAt": "2026-11-01T00:00:00Z",
                },
            },
        )

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))

    analysis = asyncio.run(HttpxFaceAnalysisClient(_SETTINGS).get_by_id(_ANALYSIS_ID, _USER_ID))

    request = captured["request"]
    assert request.url.path == f"/internal/analyses/{_ANALYSIS_ID}"
    assert request.url.params["userId"] == str(_USER_ID)
    assert request.headers["X-Internal-Key"] == "test-internal-key"
    assert analysis.analysisId == str(_ANALYSIS_ID)
    assert analysis.faceShape == FaceShape.OVAL
    assert analysis.probabilities == {FaceShape.OVAL: 0.7, FaceShape.ROUND: 0.3}


def test_get_latest_returns_none_when_the_user_has_no_analysis_AC5(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == f"/internal/users/{_USER_ID}/latest-analysis"
        return httpx.Response(404, json={"success": False, "message": "Không tìm thấy"})

    _install_mock_transport(monkeypatch, httpx.MockTransport(handler))

    assert asyncio.run(HttpxFaceAnalysisClient(_SETTINGS).get_latest(_USER_ID)) is None
