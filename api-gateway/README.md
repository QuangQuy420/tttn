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
| `/api/products/*`, `/api/categories/*`, `/api/brands/*` | `product-service` | **Implemented** — public reads are proxied via `HttpService`; the product list and detail (by id / slug) use an optional JWT: `includeAllStatuses` (and `status`, on the list only) is forwarded only when the caller has `product:manage`, stripped otherwise; writes require JWT and the matching permission (cached ≤ 60 s) (`product:manage` or `catalog:manage`); image upload max 5 MB |
| `/api/wishlist/*`, `/api/products/:id/reviews/*`, `/api/admin/reviews/*` | `product-service` | **Implemented** — review list / summary are public with an optional JWT (`includeAllStatuses` forwarded only for `product:manage`); the user's own wishlist / review need JWT; admin review moderation also needs the matching permission |
| `/api/auth/*` | `user-service` | **Implemented** — public `register` (201), `login` / `forgot-password` / `reset-password` (200); all four have the strict rate limit |
| `/api/users/*`, `/api/roles/*`, `/api/permissions` | `user-service` | **Implemented** — `/api/users/me*` (incl. addresses; create-address returns 200) and `change-password` need JWT at the gateway and forward `Authorization`; admin routes need JWT + the matching permission; role changes and a password change clear the permissions cache |
| `/api/cart/*`, `/api/orders/*`, `/api/admin/orders/*`, `/api/admin/saga-logs/*`, `/api/admin/saga-settings` | `order-service` | **Implemented** — JWT; admin routes need the matching permission |
| `/api/face-analysis/*` | `face-processing-service` | **Implemented** — JWT; `POST /api/face-analysis/analyze` (multipart, max 10 MB, own rate limit), history list / delete |
| `/api/events` | RabbitMQ `behavior-events` | **Implemented** — `POST`, optional JWT; VIEW / TRY_ON from the browser, published only for a logged-in user (own rate limit) |
| `/api/recommendations/*` | `recommendation-service` | **Implemented** — `POST /api/recommendations` is public (forwards `X-User-Id` only with a valid JWT); `GET /api/recommendations/for-you` requires JWT and forwards `X-User-Id` |
| `/api/admin/ai/*`, `/api/admin/analytics/*` | `face-processing-service`, `recommendation-service` (`/admin/*`) | **Implemented** — read-only, GET only; JWT + `order:manage`; sends `X-Internal-Key`. See [Admin AI & analytics](#admin-ai--analytics) |

> **Edge checks on every route:** id path params must be UUIDs (else **400**, Vietnamese
> message) and are URL-encoded before they are put into a downstream URL. A product `slug`
> must match `^[a-z0-9]+(-[a-z0-9]+)*$` (case-insensitive) and the saga-log `:date`
> `YYYY-MM-DD`, else **400**. Uploads without a `file` part → **400**; over the limit →
> **413** `PAYLOAD_TOO_LARGE`.
>
> Public catalog reads remain unauthenticated. Product writes require `product:manage`; Brand
> and Category writes require `catalog:manage`. The gateway verifies JWTs at the edge and checks
> the caller's current permissions before forwarding a write. Permissions are cached in Redis
> for 60 s (see below); on a miss they are read from `user-service`.

### Admin AI & analytics
Every route needs JWT + permission `order:manage` (no dedicated permission yet) and is
forwarded with `X-Internal-Key: <INTERNAL_API_KEY>` (same value as in both Python services).
On the four `/api/admin/analytics/*` routes the query is validated here: a param not listed
below, a bad format, or a value out of range → **400** `VALIDATION_FAILED`. The two
`/api/admin/ai/*` routes take no query and ignore extra params. Only the params the caller sent are forwarded (defaults,
`from <= to` and the 90-day limit are checked upstream; their 400 is passed through).

| Route | Upstream | Query |
|---|---|---|
| `GET /api/admin/ai/face-shape-model` | face-processing `GET /admin/model-info` | — |
| `GET /api/admin/ai/preference-model` | recommendation `GET /admin/model-info` | — |
| `GET /api/admin/analytics/events/daily` | recommendation `GET /admin/analytics/events/daily` | `from`, `to`, `source` |
| `GET /api/admin/analytics/funnel` | recommendation `GET /admin/analytics/funnel` | `from`, `to`, `source` |
| `GET /api/admin/analytics/top-products` | recommendation `GET /admin/analytics/top-products` | `from`, `to`, `source`, `eventType`, `limit` |
| `GET /api/admin/analytics/face-shapes` | face-processing `GET /admin/analytics/face-shapes` | `from`, `to` |

`from` / `to`: `YYYY-MM-DD`; `source`: `real` \| `simulator` \| `all`; `eventType`: `VIEW` \|
`TRY_ON` \| `LIKE` \| `ADD_TO_CART` \| `PURCHASE`; `limit`: integer 1..50. Upstream error
responses are passed through; upstream timeout → **504**, unreachable → **503**. Response
shapes: `infra/contracts/recommendation-service.md`, `infra/contracts/face-processing-service.md`.

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
  (`GET /internal/v1/users/{id}/permissions` → `{permissions, status, tokensValidAfter}`) and
  stores it for `PERMISSIONS_CACHE_TTL_SECONDS` (60). The write is skipped when an
  invalidation happened during the fetch (generation counters `permgen:{userId}` /
  `permgen:all`, each kept 1 day after its last bump), so a revoked permission is not written
  back.
- **Token revocation** — `JwtGuard` (and `OptionalJwtGuard`) read the same entry and reject the
  token (401; optional routes treat the caller as a guest) when the user is not `ACTIVE` or the
  token's `iat` is before `tokensValidAfter` (epoch seconds, set by a password change / reset).
  `PUT /api/users/change-password` clears the caller's entry, so the old token stops working at
  once; other changes are seen within 60 s.
- **When user-service cannot answer** — the internal call has its own 1.5 s timeout. On a
  cache miss, a 5xx / timeout / no response (WARN log) or a 401 / 403 from user-service (wrong
  `INTERNAL_API_KEY`, ERROR log) makes the JWT check fail open: the token is checked by
  signature and expiry only. A 404 (user gone) → 401. `PermissionsGuard` fails closed: the
  request gets the upstream error (503 / 504, or the 403 of a wrong key). After a 5xx or no
  response the gateway skips user-service for 10 s (per gateway instance): a cache miss then
  fails at once — the JWT check fails open, permission-guarded routes fail closed (503).
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
