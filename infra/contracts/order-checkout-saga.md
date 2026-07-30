# Order Checkout Saga — Event Contract

Event-driven contract for the checkout Saga introduced in
`.planning/2026-07-28-checkout-payment-saga-rabbitmq.md`. This is the spec whoever builds
`payment-service` implements against — it should be enough on its own, without reading
`order-service`'s Java source. Not code-first like `product-service.openapi.yaml`: `payment-service`
has no application code yet, so this is written ahead of any implementation and both
`order-service`'s publisher/listener and `product-service`'s consumer/publisher are built to match
it exactly.

## Exchange

| | |
|---|---|
| Name | `order-saga-events` |
| Type | topic |
| Durable | yes |
| Declared by | `order-service` (`OrderSagaEventPublisher`) and `product-service` (`order-saga-event-consumer.repository.ts`) — each asserts it idempotently on startup, whichever service starts first wins, `assertExchange`/`TopicExchange` are no-ops if it already exists with matching settings |

This is a separate exchange from the existing `product-events` topic exchange (catalog
`product.updated`/`product.deleted` notifications, see
`infra/docs/adr/0002-event-bus-selection.md`) — the checkout saga is kept a distinct bounded
concern from catalog-change notifications.

## Message envelope

Every message body is JSON. The routing key travels as the AMQP message's routing key (not
duplicated inside the body). Every message carries at minimum:

```json
{
  "orderId": "<uuid>",
  "occurredAt": "<ISO-8601 local timestamp, no zone offset — e.g. 2026-07-28T10:15:30, treat as server local time, not UTC>"
}
```

`orderId` is the saga's correlation id — every consumer uses it to look up the order and act on
its **current** status, not to blindly trust the message implies the order is still in the state
it was in when the message was published (see "Delivery guarantees" below).

## Routing keys — who publishes, who consumes

| Routing key | Publisher | Consumer | Purpose |
|---|---|---|---|
| `stock.reserve.requested` | order-service | product-service | Reserve stock for every line item of a newly created order, all-or-nothing. |
| `stock.reserved` | product-service | order-service | Every item was reserved successfully. |
| `stock.reserve.rejected` | product-service | order-service | At least one item was short on stock — nothing was reserved. |
| `payment.create.requested` | order-service | payment-service | Ask payment-service to create/process a payment for this order. |
| `payment.completed` | payment-service | order-service | Payment succeeded. |
| `payment.failed` | payment-service | order-service | Payment failed, was declined, or errored. |
| `stock.release.requested` | order-service | product-service | Compensating step: give back stock already reserved (payment failed, or the order was cancelled while `AWAITING_PAYMENT`). |

`payment-service` is the only consumer of `payment.create.requested` and the only publisher of
`payment.completed`/`payment.failed` — it has no other role in this saga (it never touches stock
messages).

## Payload per routing key

### `stock.reserve.requested` (order-service → product-service)
```json
{
  "orderId": "3e2f9c2a-1234-4a5b-8c6d-000000000001",
  "occurredAt": "2026-07-28T10:15:30",
  "items": [
    { "variantId": "b1a2c3d4-0000-0000-0000-000000000010", "quantity": 2 }
  ]
}
```
- `items`: one entry per distinct order line, `variantId` (uuid) + `quantity` (integer > 0).

### `stock.reserved` (product-service → order-service)
```json
{
  "orderId": "3e2f9c2a-1234-4a5b-8c6d-000000000001",
  "occurredAt": "2026-07-28T10:16:01"
}
```
- No `items` field — order-service already holds its own copy of the order's line items and
  re-derives them from there when it needs to build a `stock.release.requested` payload (e.g.
  cancelling an order that just got a late `stock.reserved` reply). This message is purely a
  correlation signal ("this order id's reservation succeeded"), not a data payload.

### `stock.reserve.rejected` (product-service → order-service)
```json
{
  "orderId": "3e2f9c2a-1234-4a5b-8c6d-000000000001",
  "occurredAt": "2026-07-28T10:16:01",
  "reason": "Không đủ hàng cho biến thể \"Gọng kính Ray-Ban RB2140 - Đen - Size 52\" (còn 1, cần 2)"
}
```
- `reason`: a human-readable string, **in Vietnamese** — it is recorded on
  `OrderStatusHistory` and is meant to eventually reach the customer through `web` (project-wide
  convention: all user-facing text is Vietnamese, see root `CLAUDE.md`). Names the specific short
  item the same way the superseded `2026-07-20-stock-reservation.md` plan's error messages did.

### `payment.create.requested` (order-service → payment-service)
```json
{
  "orderId": "3e2f9c2a-1234-4a5b-8c6d-000000000001",
  "occurredAt": "2026-07-28T10:16:01",
  "userId": "a9b8c7d6-0000-0000-0000-000000000099",
  "orderCode": "ORD-20260728-0001",
  "amount": 1250000.00,
  "paymentMethod": "CARD"
}
```
- Same fields `CreatePaymentRequest` (the synchronous DTO this replaces,
  `order-service/src/main/java/com/tttn/orderservice/dto/request/CreatePaymentRequest.java`)
  already carries: `orderId`, `userId`, `orderCode`, `amount` (decimal, total order amount),
  `paymentMethod` (string — still a generic, free-form field on the wire, not a closed enum).
- `payment-service` currently only accepts `"CARD"` as `paymentMethod` — this is the storefront's
  only offered payment method (`web`'s checkout picker offers no other option). Any other value
  (including the retired `"COD"`/`"BANK_TRANSFER"`) is treated as an unsupported method and fails
  immediately with a Vietnamese reason naming it.

### `payment.completed` (payment-service → order-service)
```json
{
  "orderId": "3e2f9c2a-1234-4a5b-8c6d-000000000001",
  "occurredAt": "2026-07-28T10:17:45",
  "paymentId": "c4d5e6f7-0000-0000-0000-000000000042",
  "transactionCode": "TXN-000042"
}
```
- `paymentId` (uuid) and `transactionCode` (string) are saved onto the order (mirrors
  `PaymentCreationResponse.paymentId`/`.transactionCode`). Payment status itself is implied by
  the routing key (`payment.completed` ⇒ `PaymentStatus.PAID`) — not repeated in the body.

### `payment.failed` (payment-service → order-service)
```json
{
  "orderId": "3e2f9c2a-1234-4a5b-8c6d-000000000001",
  "occurredAt": "2026-07-28T10:17:45",
  "reason": "Thanh toán bị từ chối bởi ngân hàng phát hành thẻ"
}
```
- `reason`: human-readable, **in Vietnamese** — same convention as `stock.reserve.rejected`.

### `stock.release.requested` (order-service → product-service)
```json
{
  "orderId": "3e2f9c2a-1234-4a5b-8c6d-000000000001",
  "occurredAt": "2026-07-28T10:17:45",
  "items": [
    { "variantId": "b1a2c3d4-0000-0000-0000-000000000010", "quantity": 2 }
  ]
}
```
- `items`: same shape as `stock.reserve.requested` — order-service resends the item list it
  already holds locally so product-service's consumer does not need to re-derive it. This is
  fire-and-forget: product-service publishes nothing back for this routing key.

## Delivery guarantees consumers must assume

- **At-least-once, possibly duplicated.** RabbitMQ can redeliver a message (e.g. after a consumer
  crash before ack). Every consumer must be idempotent: check the order's/reservation's *current*
  status before acting, not just react to "a message of this type arrived." A repeat
  `stock.reserve.requested` for an order that already has a `RESERVED` row is a no-op reply, not a
  double reservation; a repeat `stock.release.requested` for an already-released order is a safe
  no-op.
- **Possibly out of order relative to a user action.** A customer can cancel an order the instant
  after `stock.reserve.requested` is sent, before the `stock.reserved`/`stock.reserve.rejected`
  reply arrives. A late `stock.reserved` for an order already `CANCELLED` must trigger
  `stock.release.requested`, not silently advance the order.
- **A broker outage must never crash a publisher or consumer.** Every publish/consume failure is
  caught, logged, and retried in the background — mirroring
  `product-service/src/repositories/product-event-publisher.repository.ts`'s connect-with-retry /
  reconnect style — with one deliberate exception: order-service's very first publish of a saga
  (`stock.reserve.requested`, from inside `checkout()`) throws instead, so checkout fails cleanly
  and its local transaction rolls back the order it already saved, rather than leaving an order
  stuck in `PENDING` forever with no reservation ever attempted.

## Queues (for reference — each service owns/declares its own)

- **product-service** declares one durable queue bound to `stock.reserve.requested` and
  `stock.release.requested`.
- **order-service** declares one durable queue bound to `stock.reserved`,
  `stock.reserve.rejected`, `payment.completed`, and `payment.failed`.
- **payment-service** (not built yet) will need its own durable queue bound to
  `payment.create.requested`, and must publish `payment.completed`/`payment.failed` back onto the
  `order-saga-events` exchange (not a queue/exchange of its own) so order-service's existing
  binding picks them up.

Each service is responsible for declaring and binding its own queue — this contract only fixes
the exchange name/type and the routing keys/payloads flowing through it, not each service's
internal queue name.
