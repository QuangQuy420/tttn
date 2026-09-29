# ADR 0004: Behavior Events over RabbitMQ

## Status

Accepted

## Context

The second AI feature (personalized recommendations, "AI 2" in
`.planning/2026-09-29-00-thesis-roadmap.md`) learns from **implicit feedback**: what a user views,
tries on, likes, adds to the cart and buys. Today `recommendation-service` has no database, does
not listen to RabbitMQ and does not know who the user is — it only maps a face shape to frame
shapes.

The behavior data is produced in several places: the browser (view, try-on) through
`api-gateway`, `product-service` (wishlist like/unlike) and `order-service` (add to cart,
purchase). `recommendation-service` owns the training data, so it needs one place to collect all
of these events (`recommendation_db`, database-per-service).

Requirements:

- A user action (open a product page, add to cart, pay) must **never be slowed down or fail**
  because recommendation-service or its database is down.
- The same event may arrive more than once; it must be counted once.
- Broken messages must not block the queue.
- It must run on the existing single-machine `docker compose` stack. RabbitMQ is already the
  project's event bus (`infra/docs/adr/0002-event-bus-selection.md`).

## Decision

1. **Topic exchange `behavior-events`** (durable). Routing key `behavior.<eventType lowercase>`,
   JSON camelCase payload, as specified in `infra/contracts/behavior-events.md` (roadmap C3).
   Producers only assert the exchange; they do not know the consumer.
2. **Quorum queue + DLX in the consumer.** `recommendation-service` declares
   `recommendation-service.behavior-events` (quorum, `x-delivery-limit=10`,
   `x-dead-letter-exchange=behavior-events.dlx`) bound to `behavior.*`, and a fanout DLX
   `behavior-events.dlx` → `behavior-events.dlq`. This mirrors the saga queues. Malformed messages
   are rejected without requeue (straight to the DLQ); transient errors are requeued after a short
   delay and dead-lettered after 10 deliveries. The consumer uses `aio-pika`'s `connect_robust`,
   so it reconnects and re-declares the topology after a broker restart, and it runs as a
   background task so HTTP startup is never blocked.
3. **Consumer-side dedupe by `eventId`.** `interactions.event_id` is UNIQUE and the insert uses
   `ON CONFLICT (event_id) DO NOTHING`. A duplicate is acked and ignored.
4. **Best-effort producers, except PURCHASE.** VIEW, TRY_ON, LIKE, UNLIKE and ADD_TO_CART are
   published best effort (log and drop on broker failure). PURCHASE is the strongest signal, so it
   goes through the `order-service` transactional outbox
   (`infra/docs/adr/0003-transactional-outbox-and-idempotency.md`) with a deterministic `eventId`
   per order item.

## Alternatives considered

- **Synchronous REST ingest** (each producer calls `POST /internal/events` on
  recommendation-service). Simple, but every producer then depends on recommendation-service being
  up: a user action either becomes slower or loses the event, and each producer needs its own
  retry logic. It also couples four services to one endpoint, which is the opposite of the
  asynchronous communication the project wants.
- **Redis Streams** (Redis is already in the stack). Has consumer groups and acks, but no built-in
  dead-letter handling or delivery limit, persistence depends on the Redis config, and it would be
  a second messaging technology next to RabbitMQ with its own client code in every stack.
- **Kafka.** Built for high-volume event streams and replay, but it adds a heavy broker
  (plus KRaft/ZooKeeper setup) to a single-machine stack for a data volume a thesis project will
  never reach. RabbitMQ already covers the needed features.

## Consequences

- **Eventual consistency.** Preference features lag a few seconds behind the click: an event is
  stored after the user action, not in the same request. Recommendations do not change instantly.
- **Some events can be lost.** Best-effort producers drop events while the broker is down. This is
  acceptable for implicit feedback (a lost VIEW barely changes the model); PURCHASE is protected by
  the outbox.
- **Producers stay decoupled.** recommendation-service can be down or restarted; events wait in the
  durable quorum queue.
- **Poison messages are visible.** Bad events end up in `behavior-events.dlq` and can be inspected
  in the RabbitMQ UI instead of blocking the queue.
- **Queue arguments are fixed.** `connect_robust` re-declares the queue; changing its `x-*`
  arguments later means deleting the queue first (`PRECONDITION_FAILED` otherwise).
- **No retention policy yet.** Events are kept forever; cleanup of old rows is future work.
- `productId` is not checked against `product-service` (no cross-database FK); filtering unknown
  products is left to the dataset builder (plan 09).
