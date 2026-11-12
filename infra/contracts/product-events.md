# Product Events — Event Contract

Catalog change notifications published by `product-service` on the `product-events` exchange.
Two consumers, each with its own queue:

- `order-service` keeps every user's Redis cart in sync with the current product price, name,
  image, status and stock (see `.planning/2026-09-29-17-unified-response-pagination-cart-sync.md`,
  AC9/AC10).
- `recommendation-service` deletes its Redis catalog cache, so the next recommendation reloads
  the catalog (see `infra/docs/adr/0005-redis-cache-and-event-invalidation.md`).

The decision to use RabbitMQ is recorded in `infra/docs/adr/0002-event-bus-selection.md`.

This is a separate exchange from the checkout saga's `order-saga-events`
(`infra/contracts/order-checkout-saga.md`).

## Exchange

| | |
|---|---|
| Name | `product-events` |
| Type | topic |
| Durable | yes |
| Declared by | `product-service` (`product-event-publisher.repository.ts`), `order-service` (`RabbitMqConfig`) and `recommendation-service` (`product_event_consumer.py`) — all assert it idempotently on startup with the same settings (durable topic). Declaring it with different arguments makes the channel fail. |

## Routing keys

| Routing key | Publisher | Consumer | Published after |
|---|---|---|---|
| `product.updated` | product-service | order-service, recommendation-service | Product update (`PATCH /products/{id}`); variant create / update / delete (includes an admin stock change on a variant); product image upload, set thumbnail, image delete. |
| `product.deleted` | product-service | order-service, recommendation-service | Product soft delete (`DELETE /products/{id}`). |

- Image changes (`uploadAndAttach`, `setThumbnail`, `remove` in `product-images.service.ts`)
  publish `product.updated` once per call.
- Stock changes made by the checkout saga (reserve / release / commit in
  `inventory.service.ts`) do **not** publish anything (AC12). The cart may show slightly stale
  stock between admin edits; the checkout guard (`409 CART_CHANGED`) and the saga reservation
  are the safety net.
- Product create does not publish (no cart can contain a new product yet). For
  recommendation-service this means a new product appears in recommendations only after the
  cached catalog expires (≤ `CATALOG_TTL_SECONDS`, default 300 s).

## Payload

Same body for both routing keys. The routing key travels as the AMQP routing key, not in the
body. The body is plain JSON — it is **not** wrapped in the HTTP response envelope
(`{success, message, data}`).

```json
{
  "productId": "5f1c2d3e-0000-0000-0000-000000000001",
  "occurredAt": "2026-09-29T08:15:30.123Z"
}
```

- `productId`: uuid of the product that changed.
- `occurredAt`: ISO-8601 UTC timestamp (JavaScript `Date.toISOString()`). Note: this differs
  from `order-saga-events`, which uses local time without a zone offset.
- The event carries no product data. Consumers re-read the current state from
  `product-service`: order-service fetches the product (`GET /products/{id}`);
  recommendation-service drops its cached catalog and reloads it (`GET /products`) on the next
  recommendation.

## Delivery guarantees

- **Best effort from the publisher.** `product-service` catches and logs publish failures and
  never throws (the admin request still succeeds). Messages are persistent JSON. While the
  channel is down, events are kept in memory (de-duplicated per type + product, max 1000, oldest
  dropped first) and re-sent right after the publisher reconnects. They are still lost if
  `product-service` restarts during the outage (not a durable outbox).
- **At-least-once, possibly duplicated or out of order on the consumer side.** Consumers must be
  idempotent. Because the payload is only a "something changed" signal and consumers re-read the
  current product, processing is set-to-latest: a duplicate or late event is harmless.

## Queues

| Queue | Owner | Type | Bindings | Dead-lettering |
|---|---|---|---|---|
| `product-events.order-service` | order-service | quorum, durable | `product.updated`, `product.deleted` | DLX `product-events.dlx` → DLQ `product-events.dlq` |
| `product-events.recommendation-service` | recommendation-service | quorum, durable, `x-delivery-limit` = `BEHAVIOR_QUEUE_DELIVERY_LIMIT` (10) | `product.updated`, `product.deleted` | DLX `product-events.dlx` → DLQ `product-events.dlq` |

- The DLX `product-events.dlx` (fanout, durable) and the DLQ `product-events.dlq` (classic,
  durable) are **shared by both consumers**; both declare them with the same settings. Both
  queues get the same routing keys, so look at the `queue` field of the message's `x-death`
  header in the RabbitMQ UI to see which queue it came from.

- `order-service` (`messaging/ProductEventListener`) calls `CartService.syncProduct(productId)`:
  it scans `cart:*` in Redis and, for each cart holding the product, refreshes the item snapshot
  and sets `available` / `unavailableReason` (`PRODUCT_UNAVAILABLE`, `VARIANT_REMOVED`,
  `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`).
- If `product-service` returns 404 for the product (deleted, or no longer `PUBLISHED` — the
  public detail route hides other statuses), its cart items are marked `PRODUCT_UNAVAILABLE`. If `product-service` is unreachable, the message is **not** acked as
  success — it is retried and finally dead-lettered to `product-events.dlq`. Items are never
  marked unavailable because of an outage.
- `recommendation-service` (`app/repositories/product_event_consumer.py`): a body that is JSON
  with a non-empty `productId` → deletes the Redis key `rec:catalog:v1`, then acks. A failed
  Redis `DEL` is logged and the message is **still acked** (the catalog TTL bounds the
  staleness). A malformed body is rejected without requeue → straight to `product-events.dlq`.
  Turned off with `PRODUCT_CONSUMER_ENABLED=false`.
- Each consumer declares and binds its own queue. A new consumer should add its own
  `product-events.<service>` queue rather than share an existing one.
