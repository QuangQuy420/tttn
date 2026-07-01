# order-service

**Order Service.** Cart (Redis-backed), checkout, and order history. Payment
processing itself is delegated to `payment-service`.

> ⛔ **Language: TBD (Open Question Q2 — NestJS / Spring Boot / Go).**
> The `Dockerfile` is a placeholder until the stack is chosen.

## Responsibilities
- `GET/POST/PATCH/DELETE /cart` (per user/session, stored in Redis).
- `POST /checkout` (snapshot cart → order, call `payment-service` synchronously, persist
  order status from the payment result).
- `GET /orders` (user history) + order status.
- Validates price/stock against `product-service` over REST (East-West).
- Calls `payment-service` over REST (East-West) during checkout; does not process payments itself.

## Structure (route → service → repository → db, with DI / SOLID)
```
src/
  routes/         # HTTP controllers, DTO validation
  services/       # cart & checkout use-cases, product/payment client orchestration
  repositories/   # order/order_item (Postgres) + cart (Redis) data access
  db/             # entities/models, migrations/, connection/ORM setup
  config/         # DI container, env/config, bootstrap
  middlewares/    # auth guard, error handler, logging
tests/
```

## Data
- Postgres database `order_db` (`orders`, `order_items`).
- Redis for cart/session. See [`.env.example`](.env.example).
