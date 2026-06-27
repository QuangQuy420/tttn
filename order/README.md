# order

**Cart & Order service.** Cart (Redis-backed), checkout, orders, and history. Payment is mocked.

> ⛔ **Language: TBD (Open Question Q2 — NestJS / Spring Boot / Go).**
> The `Dockerfile` is a placeholder until the stack is chosen.

## Responsibilities
- `GET/POST/PATCH/DELETE /cart` (per user/session, stored in Redis).
- `POST /checkout` (snapshot cart → order, mock payment = success).
- `GET /orders` (user history) + order status.
- Validates price/stock against `catalog` over REST (East-West).

## Structure (route → service → repository → db, with DI / SOLID)
```
src/
  routes/         # HTTP controllers, DTO validation
  services/       # cart & checkout use-cases, catalog client orchestration
  repositories/   # order/order_item (Postgres) + cart (Redis) data access
  db/             # entities/models, migrations/, connection/ORM setup
  config/         # DI container, env/config, bootstrap
  middlewares/    # auth guard, error handler, logging
tests/
```

## Data
- Postgres database `order_db` (`orders`, `order_items`).
- Redis for cart/session. See [`.env.example`](.env.example).
