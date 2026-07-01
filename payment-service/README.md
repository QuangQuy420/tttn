# payment-service

**Payment Service.** Processes checkout payments on behalf of `order-service` (mock
payment provider for local dev) and tracks payment status/history per order.

> ⛔ **Language: TBD (Open Question Q2 — NestJS / Spring Boot / Go).**
> The `Dockerfile` is a placeholder until the stack is chosen.

## Responsibilities
- `POST /payments` — charge a payment for an order snapshot (amount, currency, method);
  called synchronously by `order-service` during checkout (East-West REST).
- `GET /payments/:orderId` — payment status/history for an order.
- Mock payment provider locally (always succeeds / simulated failure codes); swappable
  behind a `PaymentProvider` interface if a real gateway (Stripe/VNPay/etc.) is added later.

## Structure (route → service → repository → db, with DI / SOLID)
```
src/
  routes/         # HTTP controllers, DTO validation (no business logic)
  services/       # charge/refund use-cases, provider orchestration
  repositories/   # payment/payment_transaction (Postgres) data access
  db/             # entities/models, migrations/, connection/ORM setup
  config/         # DI container, env/config, bootstrap
  middlewares/    # auth guard, error handler, logging
tests/            # unit (services/repos) + integration
```

## Data
- Postgres database `payment_db` (`payments`, `payment_transactions`). See [`.env.example`](.env.example).

## Integration
- Called by `order-service` (not exposed via the gateway route table — it has no direct
  end-user–facing API surface today).
