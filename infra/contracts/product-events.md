# Product Events — Event Contract

Catalog change notifications published by `product-service` on the `product-events` exchange.
Today the only consumer is `order-service`, which uses them to keep every user's Redis cart in
sync with the current product price, name, image, status and stock (see
`.planning/2026-09-29-17-unified-response-pagination-cart-sync.md`, AC9/AC10). The decision to
use RabbitMQ is recorded in `infra/docs/adr/0002-event-bus-selection.md`.

This is a separate exchange from the checkout saga's `order-saga-events`
(`infra/contracts/order-checkout-saga.md`).

## Exchange

| | |
|---|---|
| Name | `product-events` |
| Type | topic |
| Durable | yes |
| Declared by | `product-service` (`product-event-publisher.repository.ts`) and `order-service` (`RabbitMqConfig`) — both assert it idempotently on startup with the same settings (durable topic). Declaring it with different arguments makes the channel fail. |

## Routing keys

| Routing key | Publisher | Consumer | Published after |
|---|---|---|---|
| `product.updated` | product-service | order-service | Product update (`PATCH /products/{id}`); variant create / update / delete (includes an admin stock change on a variant); product image upload, set thumbnail, image delete. |
| `product.deleted` | product-service | order-service | Product soft delete (`DELETE /products/{id}`). |

- Image changes (`uploadAndAttach`, `setThumbnail`, `remove` in `product-images.service.ts`)
  publish `product.updated` once per call.
- Stock changes made by the checkout saga (reserve / release / commit in
  `inventory.service.ts`) do **not** publish anything (AC12). The cart may show slightly stale
  stock between admin edits; the checkout guard (`409 CART_CHANGED`) and the saga reservation
  are the safety net.
- Product create does not publish (no cart can contain a new product yet).

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
- The event carries no product data. Consumers re-fetch the current product from
  `product-service` (`GET /products/{id}`) and apply the latest state.

## Delivery guarantees

- **Best effort from the publisher.** `product-service` catches and logs publish failures and
  never throws (the admin request still succeeds). An event can be lost during a broker outage.
- **At-least-once, possibly duplicated or out of order on the consumer side.** Consumers must be
  idempotent. Because the payload is only a "something changed" signal and consumers re-read the
  current product, processing is set-to-latest: a duplicate or late event is harmless.

## Queues

| Queue | Owner | Type | Bindings | Dead-lettering |
|---|---|---|---|---|
| `product-events.order-service` | order-service | quorum, durable | `product.updated`, `product.deleted` | DLX `product-events.dlx` → DLQ `product-events.dlq` |

- `order-service` (`messaging/ProductEventListener`) calls `CartService.syncProduct(productId)`:
  it scans `cart:*` in Redis and, for each cart holding the product, refreshes the item snapshot
  and sets `available` / `unavailableReason` (`PRODUCT_UNAVAILABLE`, `VARIANT_REMOVED`,
  `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`).
- If `product-service` returns 404 for the product, its cart items are marked
  `PRODUCT_UNAVAILABLE`. If `product-service` is unreachable, the message is **not** acked as
  success — it is retried and finally dead-lettered to `product-events.dlq`. Items are never
  marked unavailable because of an outage.
- Each consumer declares and binds its own queue. A new consumer (e.g. `recommendation-service`)
  should add its own `product-events.<service>` queue rather than share this one.
