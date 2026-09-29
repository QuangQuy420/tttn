"""RabbitMQ consumer for `behavior-events` — `aio-pika` against the broker.

Topology (declared here, idempotently, on every (re)connect — see
`infra/contracts/behavior-events.md`):
- `behavior-events` topic exchange; this service's quorum queue
  `recommendation-service.behavior-events` is bound with `behavior.*`.
- `behavior-events.dlx` fanout exchange → `behavior-events.dlq`. The queue dead-letters
  there on `reject(requeue=False)` or after `x-delivery-limit` redeliveries.

Delivery semantics mirror product-service's saga consumer
(`product-service/src/repositories/order-saga-event-consumer.repository.ts`): manual ack,
malformed → dead-letter immediately, any other failure → requeue. `connect_robust`
reconnects and re-declares the topology by itself after a broker restart.

NOTE: the queue's `x-*` arguments must never change once the queue exists — RabbitMQ
rejects a re-declare with different arguments (`PRECONDITION_FAILED`). Delete the queue
in the RabbitMQ UI first if they really need to change.
"""
import asyncio
import json
import logging

import aio_pika
from aio_pika.abc import (
    AbstractIncomingMessage,
    AbstractRobustChannel,
    AbstractRobustConnection,
)

from app.core.config import Settings
from app.services.interaction_ingest_service import (
    InteractionIngestService,
    MalformedEventError,
)

logger = logging.getLogger(__name__)

BEHAVIOR_EVENTS_EXCHANGE = "behavior-events"
BEHAVIOR_EVENTS_DLX = "behavior-events.dlx"
BEHAVIOR_EVENTS_DLQ = "behavior-events.dlq"
QUEUE_NAME = "recommendation-service.behavior-events"
BINDING_KEY = "behavior.*"
# Pause before requeuing after a transient failure (e.g. Postgres down), so a short outage
# doesn't burn through the delivery limit in milliseconds.
REQUEUE_DELAY_SECONDS = 2


def _event_id_for_log(body: bytes) -> str:
    """Best-effort `eventId` for log lines — never raises, even on a garbage body."""
    try:
        payload = json.loads(body)
    except ValueError:
        return "?"
    return str(payload.get("eventId", "?")) if isinstance(payload, dict) else "?"


class BehaviorEventConsumer:
    def __init__(self, settings: Settings, ingest_service: InteractionIngestService) -> None:
        self._url = settings.RABBITMQ_URL
        self._prefetch = settings.BEHAVIOR_PREFETCH
        self._delivery_limit = settings.BEHAVIOR_QUEUE_DELIVERY_LIMIT
        self._ingest_service = ingest_service
        self._connection: AbstractRobustConnection | None = None
        self._channel: AbstractRobustChannel | None = None

    async def start(self) -> None:
        """Connect, declare the topology and start consuming. Raises if the first
        connect/declare fails (the caller retries); later drops are auto-recovered."""
        connection = await aio_pika.connect_robust(self._url)
        try:
            channel = await connection.channel()
            await channel.set_qos(prefetch_count=self._prefetch)

            exchange = await channel.declare_exchange(
                BEHAVIOR_EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
            )
            dlx = await channel.declare_exchange(
                BEHAVIOR_EVENTS_DLX, aio_pika.ExchangeType.FANOUT, durable=True
            )
            dlq = await channel.declare_queue(BEHAVIOR_EVENTS_DLQ, durable=True)
            await dlq.bind(dlx)

            queue = await channel.declare_queue(
                QUEUE_NAME,
                durable=True,
                arguments={
                    "x-queue-type": "quorum",
                    "x-dead-letter-exchange": BEHAVIOR_EVENTS_DLX,
                    "x-delivery-limit": self._delivery_limit,
                },
            )
            await queue.bind(exchange, routing_key=BINDING_KEY)
            await queue.consume(self._handle_message)
        except BaseException:
            await connection.close()
            raise

        self._connection = connection
        self._channel = channel
        logger.info("Consuming %s from exchange %s", QUEUE_NAME, BEHAVIOR_EVENTS_EXCHANGE)

    async def stop(self) -> None:
        if self._connection is not None and not self._connection.is_closed:
            try:
                await self._connection.close()
            except Exception:
                logger.exception("Error while closing RabbitMQ connection")
        self._connection = None
        self._channel = None

    async def _handle_message(self, message: AbstractIncomingMessage) -> None:
        event_id = _event_id_for_log(message.body)
        try:
            result = await self._ingest_service.ingest(message.body)
        except MalformedEventError as exc:
            # Permanent failure — redelivery would never succeed. Straight to the DLQ.
            logger.error(
                "Malformed behavior event %s (routing key %s) — dead-lettering: %s",
                event_id,
                message.routing_key,
                exc,
            )
            await message.reject(requeue=False)
            return
        except Exception:
            logger.exception(
                "Failed to store behavior event %s — requeuing in %ss",
                event_id,
                REQUEUE_DELAY_SECONDS,
            )
            await asyncio.sleep(REQUEUE_DELAY_SECONDS)
            await message.nack(requeue=True)
            return

        await message.ack()
        logger.info("Behavior event %s: %s", event_id, result.value)
