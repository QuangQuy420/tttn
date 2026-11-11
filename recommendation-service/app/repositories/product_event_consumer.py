"""RabbitMQ consumer for `product-events` — clears the Redis catalog cache when a product
changes, so the next recommendation reloads the catalog from product-service.

Topology (declared here, idempotently, on every (re)connect — see
`infra/contracts/product-events.md`), with the same arguments as product-service (exchange)
and order-service (`RabbitMqConfig.java`, DLX/DLQ shared by both consumers):
- `product-events` topic exchange; this service's quorum queue
  `product-events.recommendation-service` is bound with `product.updated` and
  `product.deleted` (product-service publishes no `product.created`: new products appear
  after the cache TTL).
- `product-events.dlx` fanout exchange → `product-events.dlq` (classic queue). The queue
  dead-letters there on `reject(requeue=False)` or after `x-delivery-limit` redeliveries.

Delivery: manual ack; malformed body → dead-letter immediately; a failed Redis `DEL` is
logged by the cache and the message is still acked (the TTL bounds the staleness).
Structure mirrors `BehaviorEventConsumer`.

NOTE: the queue's `x-*` arguments must never change once the queue exists — RabbitMQ
rejects a re-declare with different arguments (`PRECONDITION_FAILED`).
"""
import json
import logging

import aio_pika
from aio_pika.abc import (
    AbstractIncomingMessage,
    AbstractRobustChannel,
    AbstractRobustConnection,
)

from app.core.config import Settings
from app.repositories.catalog_cache import ICatalogCache

logger = logging.getLogger(__name__)

PRODUCT_EVENTS_EXCHANGE = "product-events"
PRODUCT_EVENTS_DLX = "product-events.dlx"
PRODUCT_EVENTS_DLQ = "product-events.dlq"
QUEUE_NAME = "product-events.recommendation-service"
BINDING_KEYS = ("product.updated", "product.deleted")


def _product_id(body: bytes) -> str | None:
    """`productId` of a `{productId, occurredAt}` event, or None when the body is malformed."""
    try:
        payload = json.loads(body)
    except ValueError:
        return None
    if not isinstance(payload, dict):
        return None
    product_id = payload.get("productId")
    return product_id if isinstance(product_id, str) and product_id else None


class ProductEventConsumer:
    def __init__(self, settings: Settings, catalog_cache: ICatalogCache) -> None:
        self._url = settings.RABBITMQ_URL
        self._prefetch = settings.BEHAVIOR_PREFETCH
        self._delivery_limit = settings.BEHAVIOR_QUEUE_DELIVERY_LIMIT
        self._catalog_cache = catalog_cache
        self._connection: AbstractRobustConnection | None = None
        self._channel: AbstractRobustChannel | None = None

    @property
    def is_connected(self) -> bool:
        """True while the broker connection is up (False while `connect_robust` reconnects)."""
        return self._connection is not None and self._connection.connected.is_set()

    async def start(self) -> None:
        """Connect, declare the topology and start consuming. Raises if the first
        connect/declare fails (the caller retries); later drops are auto-recovered."""
        connection = await aio_pika.connect_robust(self._url)
        try:
            channel = await connection.channel()
            await channel.set_qos(prefetch_count=self._prefetch)

            exchange = await channel.declare_exchange(
                PRODUCT_EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
            )
            dlx = await channel.declare_exchange(
                PRODUCT_EVENTS_DLX, aio_pika.ExchangeType.FANOUT, durable=True
            )
            dlq = await channel.declare_queue(PRODUCT_EVENTS_DLQ, durable=True)
            await dlq.bind(dlx)

            queue = await channel.declare_queue(
                QUEUE_NAME,
                durable=True,
                arguments={
                    "x-queue-type": "quorum",
                    "x-dead-letter-exchange": PRODUCT_EVENTS_DLX,
                    "x-delivery-limit": self._delivery_limit,
                },
            )
            for binding_key in BINDING_KEYS:
                await queue.bind(exchange, routing_key=binding_key)
            await queue.consume(self._handle_message)
        except BaseException:
            await connection.close()
            raise

        self._connection = connection
        self._channel = channel
        logger.info("Consuming %s from exchange %s", QUEUE_NAME, PRODUCT_EVENTS_EXCHANGE)

    async def stop(self) -> None:
        if self._connection is not None and not self._connection.is_closed:
            try:
                await self._connection.close()
            except Exception:
                logger.exception("Error while closing RabbitMQ connection")
        self._connection = None
        self._channel = None

    async def _handle_message(self, message: AbstractIncomingMessage) -> None:
        product_id = _product_id(message.body)
        if product_id is None:
            # Permanent failure — redelivery would never succeed. Straight to the DLQ.
            logger.error(
                "Malformed product event (routing key %s) — dead-lettering", message.routing_key
            )
            await message.reject(requeue=False)
            return

        # A Redis error is logged inside `invalidate`; anything unexpected is logged here.
        # Either way the message is acked — the TTL bounds the staleness.
        try:
            await self._catalog_cache.invalidate()
        except Exception:
            logger.exception(
                "Catalog cache invalidation for product %s failed — acking anyway", product_id
            )
        await message.ack()
        logger.info(
            "Product event %s for product %s: catalog cache invalidation requested",
            message.routing_key,
            product_id,
        )
