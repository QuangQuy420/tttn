# payment-service

**Payment Service.** Mock card-payment provider for local dev, driven by the checkout saga:
listens for `payment.create.requested` on RabbitMQ, decides success/failure for card
payments, persists the outcome, and replies over the same event bus so `order-service` can
finish the order. There is no real bank/card gateway in this project.

## Design

`order-service` no longer calls payment-service synchronously over HTTP — the 2026-07-28
checkout-saga plan rewired checkout to go through RabbitMQ instead. This service is
message-driven:

- Consumes `payment.create.requested` off the `order-saga-events` topic exchange (see
  `infra/contracts/order-checkout-saga.md`).
- Decides the outcome for the sole supported `paymentMethod` value `"CARD"`: succeeds if
  `amount` is at or above `PAYMENT_MIN_CARD_AMOUNT` (default 1,000,000 VND), otherwise fails
  with a Vietnamese reason naming the minimum. Any other `paymentMethod` value fails
  immediately as unsupported.
- Persists every processed payment (order id, user id, order code, amount, method, outcome,
  transaction code or failure reason) in its own `payment_db`.
- Publishes `payment.completed` (with `paymentId`/`transactionCode`) or `payment.failed`
  (with a Vietnamese `reason`) back onto `order-saga-events`.
- Is idempotent: a redelivered `payment.create.requested` for an order id that already has a
  stored payment does not re-decide the outcome or write a second row — it just re-publishes
  the already-stored reply.

If a real gateway (VNPay/Stripe/etc.) is ever added, `PaymentsService.processPayment`'s
decision step is the seam to swap out — it's already isolated behind `IPaymentRepository`/
`IOrderSagaEventPublisher` interfaces, so the swap wouldn't touch the
consumer/controller/publisher plumbing.

## Responsibilities
- `GET /payments/:orderId` — payment status/amount/method/transaction-code-or-reason for a
  given order (internal/debug use, not routed through `api-gateway`).
- `GET /health` — plain, no-auth health check for the Compose healthcheck.
- No `POST /payments` — checkout no longer calls payment-service synchronously; there is
  nothing left to call it over REST for.

## Structure (route → service → repository → db, with DI / SOLID)
```
src/
  routes/         # HTTP controllers (payments, health), DTOs (no business logic)
  services/       # PaymentsService — the mock success/fail decision, idempotency
  repositories/   # payment (Postgres) + order-saga-event publisher/consumer (RabbitMQ)
  db/             # entities/enums/migrations, TypeORM connection setup
  config/         # TypeORM options, env wiring
```

## Data
- Postgres database `payment_db`, table `payments`. See [`.env.example`](.env.example).
- Migrations are TypeORM-CLI-generated, never hand-written:
  ```bash
  npm run migration:generate -- src/db/migrations/<Name>
  npm run migration:run
  npm run migration:revert
  ```

## Integration
- Consumes `payment.create.requested`, publishes `payment.completed`/`payment.failed`, both on
  the `order-saga-events` topic exchange — see `infra/contracts/order-checkout-saga.md` for
  the exact payload shapes and delivery guarantees.
- `GET /payments/:orderId` is internal/debug only, not routed through `api-gateway` — no
  direct end-user-facing API surface today.

## Commands
```bash
npm run build            # tsc via nest build
npm run lint              # eslint, no --fix
npm test                  # jest unit tests (*.spec.ts)
npm run start:dev         # nest start --watch
```
