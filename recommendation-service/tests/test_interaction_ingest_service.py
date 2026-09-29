"""Unit tests for `InteractionIngestService.ingest` — raw message body -> STORED /
DUPLICATE / `MalformedEventError`. Uses a fake `IInteractionRepository` injected through
`repository_scope`, so no Postgres or RabbitMQ is needed.
"""
import asyncio
import json
from contextlib import asynccontextmanager

import pytest

from app.schemas.behavior_event import BehaviorEvent
from app.services.interaction_ingest_service import (
    IngestResult,
    InteractionIngestService,
    MalformedEventError,
)

_EVENT = {
    "eventId": "7b6f1c1e-3f0a-4c55-9d1f-0a4f3c2b1a11",
    "eventType": "VIEW",
    "userId": "1f2e3d4c-5b6a-4789-8a7b-6c5d4e3f2a10",
    "productId": "9a8b7c6d-5e4f-4321-8765-43210fedcba9",
    "occurredAt": "2026-09-29T10:00:00.000Z",
    "source": "web",
    "context": {"sessionId": "s-1", "durationMs": 1200},
}


class _FakeInteractionRepository:
    """Mimics `INSERT ... ON CONFLICT (event_id) DO NOTHING`: True only the first time."""

    def __init__(self):
        self.stored: dict = {}

    async def insert_if_absent(self, event: BehaviorEvent) -> bool:
        if event.eventId in self.stored:
            return False
        self.stored[event.eventId] = event
        return True


def _service(repository: _FakeInteractionRepository) -> InteractionIngestService:
    @asynccontextmanager
    async def scope():
        yield repository

    return InteractionIngestService(scope)


def test_ingest_valid_event_is_stored() -> None:
    repository = _FakeInteractionRepository()

    result = asyncio.run(_service(repository).ingest(json.dumps(_EVENT).encode()))

    assert result is IngestResult.STORED
    stored = next(iter(repository.stored.values()))
    assert str(stored.userId) == _EVENT["userId"]
    assert stored.eventType.value == "VIEW"


def test_ingest_same_event_id_twice_is_duplicate() -> None:
    repository = _FakeInteractionRepository()
    service = _service(repository)
    body = json.dumps(_EVENT).encode()

    first = asyncio.run(service.ingest(body))
    second = asyncio.run(service.ingest(body))

    assert (first, second) == (IngestResult.STORED, IngestResult.DUPLICATE)
    assert len(repository.stored) == 1


@pytest.mark.parametrize(
    "body",
    [
        b"{not json",
        json.dumps({k: v for k, v in _EVENT.items() if k != "userId"}).encode(),
    ],
    ids=["bad-json", "missing-userId"],
)
def test_ingest_malformed_event_raises_and_stores_nothing(body: bytes) -> None:
    repository = _FakeInteractionRepository()

    with pytest.raises(MalformedEventError):
        asyncio.run(_service(repository).ingest(body))

    assert repository.stored == {}
