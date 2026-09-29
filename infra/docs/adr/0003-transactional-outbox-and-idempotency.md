# ADR 0003: Transactional Outbox for Saga Events and Idempotent Checkout

## Status

Accepted

## Context

The checkout saga (`infra/contracts/order-checkout-saga.md`) starts in `order-service`'s
`OrderServiceImpl.checkout()`: one `@Transactional` method saves the order and, in the same
method, publishes `stock.reserve.requested` straight to RabbitMQ with `RabbitTemplate`. The later
saga steps (`payment.create.requested`, `stock.release.requested`) were published the same way
from the saga listener, the cancel flow and `SagaReconciliationJob`.

This is a **dual write**: a DB commit and a broker publish that are not atomic.

- The event can go out **before** the order commits. If the commit then fails, consumers act on
  an order that does not exist; if it is slow, a fast reply can arrive before the order is visible.
- The order can commit while the event is **lost** (best-effort publishes are caught and logged).
  Only `SagaReconciliationJob` (1–2 minutes later) resends it.
- The first publish threw on failure so that checkout rolled back — which means **checkout was
  unavailable whenever RabbitMQ was down**.

Separately, checkout was not idempotent: a double click, or a client retry after a network error
whose first request actually succeeded, created **two orders**.

## Decision

1. **Polling transactional outbox.** Saga events are written as rows in an `outbox_events` table
   (`OutboxService.enqueue`, `Propagation.MANDATORY`) inside the same DB transaction as the order
   change. `OutboxRelay` polls every second (configurable), locks up to 50 due `PENDING` rows with
   `FOR UPDATE SKIP LOCKED` (safe with several instances), sends them with **publisher confirms**
   (`publisher-confirm-type: correlated`, `mandatory` + returns), and marks a row `SENT` only after
   an ack for a routable message. Failures retry with exponential backoff (1s, 2s, 4s… max 60s);
   after 20 attempts the row is `FAILED` and a WARN saga log is written. The AMQP `messageId` is
   the outbox row id so consumers can de-duplicate. Payloads and routing keys are unchanged.
   `SagaReconciliationJob` stays (a consumer can still lose a message) but skips orders that still
   have a `PENDING` outbox row.
2. **Idempotency keys in Postgres.** Checkout accepts an optional `Idempotency-Key` header. The key
   (per user, with a SHA-256 hash of the canonical request and the response snapshot) is inserted
   in the **same transaction** as the order, under a `UNIQUE (user_id, idempotency_key)` index. A
   retry with the same body replays the stored response (`Idempotent-Replayed: true`); a different
   body is a 409; a concurrent duplicate fails on the unique index, rolls back its own order and
   replays the winner's response. Keys expire after 24 hours and are cleaned up hourly.

## Alternatives considered

- **CDC / Debezium** (stream the outbox table or the WAL to RabbitMQ). No polling latency and no
  relay code, but it adds Kafka Connect/Debezium Server and WAL configuration to a single-machine
  `docker compose` stack — too much operational weight for this project.
- **Distributed transaction (XA / 2PC)** across Postgres and RabbitMQ. RabbitMQ does not support
  XA, and 2PC couples availability of both systems — the opposite of what we want.
- **Publish after commit** (`TransactionSynchronization.afterCommit`). Removes "event before
  commit", but an event is still lost if the process or broker fails right after the commit.
- **Idempotency keys in Redis.** Faster and has native TTL, but a Redis write cannot be part of
  the Postgres order transaction, so "order committed but key not stored" (or the reverse) is
  possible, and the concurrent-duplicate case would need a separate lock. Postgres gives atomicity
  and the unique index for free.

## Consequences

- **Checkout works while RabbitMQ is down.** The order is created `PENDING`; the saga continues
  when the broker comes back (eventual consistency). This is a deliberate behavior change.
- **Extra latency:** each saga step can wait up to one relay poll (~1s) before being published.
- **Delivery is at-least-once.** A row can be sent twice (ack received but the `SENT` update not
  committed) and reconciliation can enqueue duplicates, so consumers must stay idempotent.
- **Table growth:** `SENT` outbox rows are kept for now; a future cleanup (e.g. delete `SENT` rows
  older than 7 days) can be added to the hourly cleanup job.
- **Replay is a snapshot:** a replayed checkout response shows the order state at creation time,
  not the live state.
- Any new event producer in `order-service` (e.g. behavior events on another exchange) should use
  `OutboxService` too, and its exchange must be declared, or the relay will keep retrying it.
