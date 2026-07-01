# api-gateway

**API Gateway — the single North-South entry point.** All browser traffic enters here;
the gateway routes to internal services, centralizes CORS, verifies JWT at the edge, and
applies rate-limiting.

> ⛔ **Language: TBD (Open Question Q2 — NestJS / Spring Boot / Go).**
> The `Dockerfile` is a placeholder until the stack is chosen.

## Responsibilities
- Route `/api/auth/*` (→ `user-service`), `/api/products/*` (→ `product-service`),
  `/api/orders/*` (→ `order-service`), `/api/face/*` (→ `face-processing-service`),
  `/api/recommendations/*` (→ `recommendation-service`) to the matching internal service
  (East-West REST). `payment-service` is internal-only and not routed here.
- Central CORS, `/health`, rate-limit.
- Edge JWT verification (then forward identity to internal services — see ADR on JWT).

## Structure
```
src/
  routes/        # route definitions + proxy mapping (one place per downstream service)
  services/      # forwarding / proxy clients, JWT verification, rate-limit policy
  middlewares/   # CORS, auth guard, error handler, logging
  config/        # DI wiring, env config, downstream service URLs
tests/
```
> The gateway has **no repository/db layer** — it owns no data; it only proxies.

## Env
See [`.env.example`](.env.example). Downstream service URLs are injected via env.
