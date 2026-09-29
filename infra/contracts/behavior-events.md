# Behavior Events — Event Contract

User behavior events (view, try-on, like, add to cart, purchase) published on the
`behavior-events` exchange. The only consumer is `recommendation-service`, which stores each
event once in `recommendation_db.interactions` as implicit feedback for the recommendation model
(see `.planning/2026-09-29-04-behavior-event-store.md` and roadmap C3/C4 in
`.planning/2026-09-29-00-thesis-roadmap.md`). The decision is recorded in
`infra/docs/adr/0004-behavior-events-over-rabbitmq.md`.

This is a separate exchange from `product-events` (`infra/contracts/product-events.md`) and the
checkout saga's `order-saga-events` (`infra/contracts/order-checkout-saga.md`).

## Exchange

| | |
|---|---|
| Name | `behavior-events` |
| Type | topic |
| Durable | yes |
| Declared by | `recommendation-service` (`behavior_event_consumer.py`) and every producer — each asserts it idempotently on startup with the same settings (durable topic). Declaring it with different arguments makes the channel fail. |

## Routing keys

Routing key = `behavior.<eventType lowercase>`.

| Routing key | `eventType` | Producer (`source`) | Trigger |
|---|---|---|---|
| `behavior.view` | `VIEW` | `api-gateway` (`web`) | User opens a product page (web → `POST /api/events`). |
| `behavior.try_on` | `TRY_ON` | `api-gateway` (`web`) | User tries the frame on in the AR try-on (web → `POST /api/events`). |
| `behavior.like` | `LIKE` | `product-service` | Product added to the wishlist. |
| `behavior.unlike` | `UNLIKE` | `product-service` | Product removed from the wishlist. |
| `behavior.add_to_cart` | `ADD_TO_CART` | `order-service` | Item added to the cart (`CartServiceImpl`). |
| `behavior.purchase` | `PURCHASE` | `order-service` | One event per order item after `payment.completed`. |
| any of the above | any | `simulator` | Synthetic behavior data (plan 09), published the same way. |

- `source="web"` means the event came from the browser but was **published by `api-gateway`** on
  its behalf. The browser never talks to RabbitMQ.
- Producers are implemented in `.planning/2026-09-29-05-behavior-event-producers.md` (plan 05),
  which also fills in the exact trigger and `eventId` strategy per producer.

## Payload

The routing key travels as the AMQP routing key; the body repeats the type in `eventType`. The
body is plain JSON (camelCase) — it is **not** wrapped in the HTTP response envelope
(`{success, message, data}`).

```jsonc
{
  "eventId": "uuid-v4",            // idempotency key; UNIQUE in recommendation_db
  "eventType": "VIEW|TRY_ON|LIKE|UNLIKE|ADD_TO_CART|PURCHASE",
  "userId": "uuid",                // required (anonymous events are dropped at the gateway)
  "productId": "uuid",
  "occurredAt": "2026-09-29T10:00:00.000Z",
  "source": "web|product-service|order-service|simulator",
  "context": { "variantId": "uuid?", "quantity": 1, "orderId": "uuid?", "sessionId": "string?",
               "durationMs": 0, "faceShape": "OVAL?" }
}
```

Field rules (checked by the consumer):

| Field | Rule |
|---|---|
| `eventId` | uuid, required. Idempotency key (see below). |
| `eventType` | required, one of `VIEW`, `TRY_ON`, `LIKE`, `UNLIKE`, `ADD_TO_CART`, `PURCHASE` (UPPERCASE). |
| `userId` | uuid, required. Anonymous events are never published. |
| `productId` | uuid, required. Not checked against `product-service` (no cross-DB check). |
| `occurredAt` | ISO-8601 timestamp **with** a zone offset (e.g. `Z`), required. A timestamp without a zone is rejected. |
| `source` | required, one of `web`, `product-service`, `order-service`, `simulator`. |
| `context` | object, optional (default `{}`). All keys optional; unknown keys are ignored. |
| `context.variantId` | uuid |
| `context.quantity` | integer ≥ 1 |
| `context.orderId` | uuid |
| `context.sessionId` | string, max 64 chars |
| `context.durationMs` | integer ≥ 0 |
| `context.faceShape` | one of the face-shape enum values (e.g. `OVAL`) |

The consumer also stores `received_at` (server time when the event was stored). `occurredAt` is
kept as sent, even if it is in the future or very old.

## Idempotency

- `eventId` is UNIQUE in `recommendation_db.interactions`. The consumer inserts with
  `ON CONFLICT (event_id) DO NOTHING`, so the same event delivered twice is stored once and the
  duplicate is still acked.
- Producers set the AMQP `messageId` to `eventId`.
- Most producers use a random uuid v4 per event. `PURCHASE` uses a **deterministic** id derived
  from the order and the item (plan 05), so a redelivered `payment.completed` publishes the same
  `eventId` again and is de-duplicated here.

## Delivery guarantees

- **Best effort from producers**, except `PURCHASE`. A producer logs and drops the event when the
  broker is down; the user request never fails because of it. `PURCHASE` goes through the
  `order-service` transactional outbox (`infra/docs/adr/0003-transactional-outbox-and-idempotency.md`).
- **At-least-once on the consumer side.** A message can arrive more than once; the consumer
  de-duplicates by `eventId`.
- **Eventual consistency.** An event is stored shortly after the user action (normally within
  a few seconds), not in the same request.

## Queues

| Queue | Owner | Type | Bindings | Dead-lettering |
|---|---|---|---|---|
| `recommendation-service.behavior-events` | recommendation-service | quorum, durable, `x-delivery-limit=10` | `behavior.*` | DLX `behavior-events.dlx` → DLQ `behavior-events.dlq` |
| `behavior-events.dlq` | recommendation-service | durable | bound to `behavior-events.dlx` (fanout, durable) | — |

- Same shape as the saga queues (`product-service/src/repositories/order-saga-event-consumer.repository.ts`).
- Consumer outcome per message:
  - stored or duplicate → ack;
  - invalid JSON or a field rule broken → reject without requeue → goes straight to the DLQ;
  - other error (e.g. Postgres down) → short wait, then requeue; after 10 deliveries the quorum
    queue dead-letters the message to the DLQ.
- Queue arguments are fixed. Changing them later means deleting the queue in the RabbitMQ UI
  first, or the next declare fails with `PRECONDITION_FAILED`.
- A new consumer should add its own `behavior-events.<service>` queue rather than share this one.

## Implicit-feedback weights

How the stored events are used for training (roadmap C4, plans 09 and 10):

| event | weight w | graded label |
|---|---|---|
| VIEW | 1 | 1 |
| TRY_ON | 2 | 2 |
| LIKE | 3 | 2 |
| ADD_TO_CART | 4 | 3 |
| PURCHASE | 5 | 4 |
| none (sampled negative) | 0 | 0 |

- Pair label = max graded label over the (user, product) pair in the window. UNLIKE cancels an
  earlier LIKE.
- Aggregated affinity = Σ w·exp(−Δt/τ), τ = 14 days (config).
