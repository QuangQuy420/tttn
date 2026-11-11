"""Tests for the `X-Request-Id` middleware (plan 14, AC10) — a valid incoming id is kept and
echoed on the response, an invalid one is replaced by a new UUID. Uses `GET /health`, which
needs no dependency.
"""
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_valid_incoming_request_id_is_echoed_AC10() -> None:
    response = client.get("/health", headers={"X-Request-Id": "abc-12345-XYZ"})

    assert response.status_code == 200
    assert response.headers["X-Request-Id"] == "abc-12345-XYZ"


def test_invalid_incoming_request_id_is_replaced_with_a_uuid_AC10() -> None:
    response = client.get("/health", headers={"X-Request-Id": "bad id!"})

    request_id = response.headers["X-Request-Id"]
    assert request_id != "bad id!"
    assert str(uuid.UUID(request_id)) == request_id
