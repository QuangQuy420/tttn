# Product Events — Event Contract

Event contract for catalog-change notifications on the `product-events` exchange, introduced
as the proof-of-concept in `infra/docs/adr/0002-event-bus-selection.md` and extended by
`.planning/2026-08-18-sync-cart-snapshots-on-product-update.md`. This is a separate exchange
from `order-saga-events` (see `infra/contracts/order-checkout-saga.md`) — catalog-change
notifications are kept a distinct bounded concern from the checkout saga.

ADR 0002 noted "no consumer exists yet — messages are simply dropped"; that status is resolved:
`order-service` now consumes these events to refresh Redis cart snapshots (see "Consumers"
below).

## Exchange

| | |
|---|---|
| Name | `product-events` |
| Type | topic |
| Durable | yes |
| Declared by | `product-service` (`product-event-publisher.repository.ts`, raw `amqplib` `assertExchange`) and each consumer — asserted idempotently on startup, whichever service starts first wins; any consumer's declaration must match this type/durability exactly or the second declaration gets a channel error |

## Publisher

`product-service` is the only publisher. It publishes via raw `amqplib` (not
`@nestjs/microservices`), **fire-and-forget**:

- No publisher confirms — a broker outage can silently drop an event. Publish failures are
  caught and logged, never thrown; an admin's update/delete request must never fail because
  the broker is down. Consumers must tolerate a missed event (carts self-heal on the next
  user action or event; checkout re-fetches prices independently).
- No message type headers — the routing key is the only event-type discriminator, and the
  body is plain JSON with no envelope. Spring consumers must not rely on
  `__TypeId__`-style headers (use inferred-type conversion).

## Routing keys — when each fires

| Routing key | Fires on |
|---|---|
| `product.updated` | Product update (`PATCH /products/:id` — skipped when the PATCH is a no-op with no fields to change); variant create/update/delete; product image create/upload/set-thumbnail/delete |
| `product.deleted` | Product soft-delete (`DELETE /products/:id`) |

## Payload

Every message body is the same minimal JSON shape, for both routing keys:

```json
{
  "productId": "3e2f9c2a-1234-4a5b-8c6d-000000000001",
  "occurredAt": "2026-08-18T10:15:30.123Z"
}
```

- `productId`: string (uuid) — the affected product. Variant and image mutations carry the
  *parent product's* id, not the variant/image id.
- `occurredAt`: string (ISO-8601, UTC with `Z` offset — produced by JS
  `new Date().toISOString()`).

## Consumer convention — thin payload, re-fetch state

The payload is deliberately thin (ADR 0002 left the event-schema question open; this contract
keeps the minimal shape). Events are *notifications*, not state carriers:

- On any event, the consumer re-fetches the product's **current** state via
  `GET /products/:id` on product-service and acts on that — never on state inferred from the
  event itself. This makes processing idempotent and safe under redelivery, duplication, and
  reordering: whatever arrives, the consumer converges on the latest state.
- A `404` response, or a fetched `status != PUBLISHED`, means **treat the product as gone**
  (equivalent to `product.deleted`), regardless of which routing key triggered the fetch.
- At-least-once delivery applies (as in `order-checkout-saga.md`): duplicates and redeliveries
  must be no-ops, and a broker outage must never crash a consumer.

## Consumers

Each consumer declares and binds its own queue; this contract fixes only the exchange,
routing keys, and payload.

### order-service — `product-events.order-service`

First real consumer: refreshes the cart snapshots stored in Redis (`cart:{userId}`) so a
customer's cart reflects product edits without the customer touching the item.

| | |
|---|---|
| Queue | `product-events.order-service` (durable, quorum) |
| Bindings | `product.updated`, `product.deleted` |
| Delivery limit | `x-delivery-limit`, default 10 (env `PRODUCT_EVENTS_DELIVERY_LIMIT`) |
| DLX | `product-events.dlx` (fanout) |
| DLQ | `product-events.dlq` (durable; poison messages logged by a dead-letter listener) |

Behavior: `product.updated` → re-fetch the product and overwrite each matching cart item's
snapshot (name, prices, color, size, image); an item whose variant no longer exists is
removed. `product.deleted`, a `404`, or `status != PUBLISHED` → remove the product's items
from every cart. Transient failures (product-service unreachable) are nack+requeued up to the
delivery limit, then dead-lettered — the queue never blocks.

Future subscribers (e.g. `recommendation-service`, per ADR 0002) bind their own queues to the
same exchange under the same convention.
