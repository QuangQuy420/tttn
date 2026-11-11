# api-gateway

**API Gateway — the single North-South entry point.** All browser traffic enters here;
the gateway routes to internal services, centralizes CORS, verifies JWT at the edge, checks
permissions, applies rate-limiting and gives every request an `X-Request-Id`.

> ✅ **Language: NestJS + TypeScript** (locked in). Scaffolded and building.

## Responsibilities
- Route incoming `/api/*` traffic to the matching internal service (East-West REST).
  `payment-service` is internal-only and not routed here.
- Central CORS, `/health` (liveness for Docker, never rate-limited).
- Edge JWT verification, then the caller's id is forwarded to internal services as `X-User-Id`.
- Rate limit, permissions cache and request id — see the sections below.

### Route table

| Route | Downstream service | Status |
|---|---|---|
| `/api/products/*`, `/api/categories/*`, `/api/brands/*` | `product-service` | **Implemented** — public reads are proxied via `HttpService`; writes require JWT and the matching permission (cached ≤ 60 s) (`product:manage` or `catalog:manage`) |
| `/api/wishlist/*`, `/api/products/:id/reviews/*`, `/api/admin/reviews/*` | `product-service` | **Implemented** — review list / summary are public; the user's own wishlist / review need JWT; admin review moderation also needs the matching permission |
| `/api/auth/*` | `user-service` | **Implemented** — public `register`, `login`, `forgot-password`, `reset-password` (strict rate limit) |
| `/api/users/*`, `/api/roles/*`, `/api/permissions` | `user-service` | **Implemented** — `/api/users/me*` and `change-password` forward `Authorization` (user-service verifies it); admin routes need JWT + the matching permission; role changes clear the permissions cache |
| `/api/cart/*`, `/api/orders/*`, `/api/admin/orders/*`, `/api/admin/saga-logs/*`, `/api/admin/saga-settings` | `order-service` | **Implemented** — JWT; admin routes need the matching permission |
| `/api/face-analysis/*` | `face-processing-service` | **Implemented** — JWT; `POST /api/face-analysis/analyze` (multipart, own rate limit), history list / delete |
| `/api/events` | RabbitMQ `behavior-events` | **Implemented** — `POST`, optional JWT; VIEW / TRY_ON from the browser, published only for a logged-in user (own rate limit) |
| `/api/recommendations/*` | `recommendation-service` | **Implemented** — `POST /api/recommendations` is public (forwards `X-User-Id` only with a valid JWT); `GET /api/recommendations/for-you` requires JWT and forwards `X-User-Id` |

> Public catalog reads remain unauthenticated. Product writes require `product:manage`; Brand
> and Category writes require `catalog:manage`. The gateway verifies JWTs at the edge and checks
> the caller's current permissions before forwarding a write. Permissions are cached in Redis
> for 60 s (see below); on a miss they are read from `user-service`.

## Rate limit
`@nestjs/throttler`, one in-memory throttler (one gateway instance — ADR 0005). Counted **per
user** when the request has a valid JWT, otherwise **per IP**, and per route, in a window of
`RATE_LIMIT_TTL_MS` (60 000 ms):

| Routes | Limit | Env var |
|---|---|---|
| `POST /api/auth/register`, `/login`, `/forgot-password`, `/reset-password` | 5 | `RATE_LIMIT_AUTH` |
| `POST /api/face-analysis/analyze` | 10 | `RATE_LIMIT_FACE_ANALYZE` |
| `POST /api/events` | 60 | `RATE_LIMIT_EVENTS` |
| every other route | 100 | `RATE_LIMIT_DEFAULT` |
| `GET /health` | not limited | — |

Over the limit → **429**:
```json
{ "success": false, "message": "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút",
  "error": { "code": "TOO_MANY_REQUESTS", "details": null } }
```
Inside Docker all guests (no JWT) share one IP bucket per route — accepted for local use.

## Permissions cache (Redis)
- `PermissionsGuard` reads `perm:{userId}` (user id lower-cased) from Redis; on a miss it calls `user-service`
  (`GET /internal/v1/users/{id}/permissions`) and stores the list for
  `PERMISSIONS_CACHE_TTL_SECONDS` (60).
- After a **successful** role change through the gateway the cache is cleared:
  `POST /api/users/:id/roles` and `DELETE /api/users/:id/roles/:roleId` → that user's key;
  `PUT /api/roles/:id` and `DELETE /api/roles/:id` → every `perm:*` key. A role change made
  directly in `user-service` is seen after at most 60 s.
- Redis down → the gateway still starts and works; every check goes to `user-service` (no
  500). If Redis is up but stops answering, each command waits for the 0.5 s command timeout,
  so a permission-gated request can take about 1 s longer (GET + SETEX) before it falls back.

## Request id
- Every request gets `X-Request-Id`: the client's value when it matches `^[A-Za-z0-9-]{8,64}$`,
  otherwise a new UUID. It is set on every routed response (including the 404 / 429 / 4xx the gateway creates);
  CORS preflight responses and body-parse errors (malformed JSON, payload too large) are the
  exception. It is exposed through CORS
  and forwarded on every downstream HTTP call.
- One access log line per request: `METHOD /path STATUS 12ms <requestId>`. Search the same id in
  the `recommendation-service` / `face-processing-service` logs. Contract:
  [`infra/contracts/README.md`](../infra/contracts/README.md).

## Structure
```
src/
  routes/        # controllers + modules (one per downstream domain), DTOs, /health
  services/      # proxy clients (HttpService), behavior-event publisher, Redis + permissions cache
  auth/          # JWT / permissions guards, rate-limit tier decorator + tracker
  common/        # error filter, request-id middleware + context, shared HttpModule, cache module
  config/        # env config, downstream service URLs
tests/           # e2e specs (unit specs live next to the source in src/)
```
> The gateway has **no repository/db layer** — it owns no data; it only proxies.

## Env
See [`.env.example`](.env.example). Downstream service URLs are injected via env.
New in plan 14 (all have defaults): `REDIS_URL` (default `redis://localhost:6379`; in Docker
set `redis://redis:6379` like `.env.example` — otherwise the cache is just bypassed),
`PERMISSIONS_CACHE_TTL_SECONDS` (60), `RATE_LIMIT_TTL_MS` (60000), `RATE_LIMIT_DEFAULT` (100),
`RATE_LIMIT_AUTH` (5), `RATE_LIMIT_FACE_ANALYZE` (10), `RATE_LIMIT_EVENTS` (60). An invalid or
non-positive number for one of these falls back to its default.
