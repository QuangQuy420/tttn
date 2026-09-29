"""Ingest one raw `behavior-events` message into the `interactions` table.

Pure logic: parse + validate the body, then one repository call. It never opens DB
sessions itself — the caller injects `repository_scope`, an async context-manager factory
that yields an `IInteractionRepository` (the real one opens a session and commits, see
`interaction_repository_scope`; unit tests pass a fake). Transport concerns (ack / reject
/ requeue) stay in `app/repositories/behavior_event_consumer.py`.
"""
import enum
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager

from pydantic import ValidationError

from app.repositories.interaction_repository import IInteractionRepository
from app.schemas.behavior_event import BehaviorEvent

RepositoryScope = Callable[[], AbstractAsyncContextManager[IInteractionRepository]]


class MalformedEventError(Exception):
    """The message body is not valid JSON or does not match the event contract —
    redelivering it would never succeed."""


class IngestResult(str, enum.Enum):
    STORED = "STORED"
    DUPLICATE = "DUPLICATE"


class InteractionIngestService:
    def __init__(self, repository_scope: RepositoryScope) -> None:
        self._repository_scope = repository_scope

    @staticmethod
    def parse(raw: bytes) -> BehaviorEvent:
        """Validate the raw body. Raises `MalformedEventError` on bad JSON / bad fields."""
        try:
            # Pydantic reports invalid JSON as a `ValidationError` too (`json_invalid`).
            return BehaviorEvent.model_validate_json(raw)
        except ValidationError as exc:
            raise MalformedEventError(str(exc)) from exc

    async def ingest(self, raw: bytes) -> IngestResult:
        """Store the event once per `eventId`. Raises `MalformedEventError` for a bad
        body; any other exception (e.g. DB down) is transient and propagates."""
        event = self.parse(raw)
        async with self._repository_scope() as repository:
            inserted = await repository.insert_if_absent(event)
        return IngestResult.STORED if inserted else IngestResult.DUPLICATE
