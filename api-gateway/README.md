# api-gateway

**API Gateway — the single North-South entry point.** All browser traffic enters here;
the gateway routes to internal services, centralizes CORS, verifies JWT at the edge, and
applies rate-limiting.

> ✅ **Language: NestJS + TypeScript** (locked in). Scaffolded and building.

## Responsibilities
- Route incoming `/api/*` traffic to the matching internal service (East-West REST).
  `payment-service` is internal-only and not routed here.
- Central CORS, `/health`, rate-limit.
- Edge JWT verification (then forward identity to internal services — see ADR on JWT).

### Route table

| Route | Downstream service | Status |
|---|---|---|
| `/api/products/*`, `/api/categories/*`, `/api/brands/*` | `product-service` | **Implemented** (Sprint 1) — proxied via `HttpService`, no auth guard yet |
| `/api/auth/*` | `user-service` | Reserved — not implemented, service doesn't exist yet |
| `/api/orders/*` | `order-service` | Reserved — not implemented, service doesn't exist yet |
| `/api/face/*` | `face-processing-service` | Reserved — not implemented, no route wired yet |
| `/api/recommendations/*` | `recommendation-service` | Reserved — not implemented, no route wired yet |

> **Edge JWT verification is deferred** (see the ADR referenced above, once written by the
> `user-service` owner). Until then, all proxied routes — including `/api/products/*` — are
> unauthenticated. Add the auth guard here once the ADR lands; never let a route bypass it
> afterwards.

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
