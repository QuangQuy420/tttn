# ADR 0005: Redis Cache with Event-Driven Invalidation, and Gateway Rate Limiting

## Status

Accepted

## Context

Two read paths repeat the same remote call on every request:

- **Permissions at the gateway.** `PermissionsGuard` (`api-gateway/src/auth/permissions.guard.ts`)
  checks the caller's *current* permissions on every admin request. Before this decision it
  called user-service (`GET /internal/v1/users/{id}/permissions`) each time — two admin clicks,
  two identical calls.
- **The product catalog in recommendation-service.** Every recommendation scores the whole
  catalog, loaded page by page from product-service (`GET /products?page=n&limit=100`). Plan 11
  cached it **in process** for `CATALOG_TTL_SECONDS` (300 s), so an admin price change or delete
  was not seen for up to 5 minutes, and the cache was lost on every restart.

Meanwhile `product-service` already publishes `product.updated` / `product.deleted` on the
`product-events` exchange (`infra/contracts/product-events.md`, ADR 0002), and Redis already runs
in `docker compose` (used by order-service for carts).

The gateway also had no rate limit, although the docs said it did. Login, register and the
password-reset routes can be brute-forced, face analysis is expensive (MediaPipe + S3 upload),
and `POST /api/events` writes to RabbitMQ.

Requirements: a cache is never the source of truth (losing Redis must keep the system correct,
only slower); permissions TTL ≤ 60 s; catalog TTL ≤ 300 s; one gateway instance, local only.

## Decision

1. **Cache-aside for permissions in the gateway.** `PermissionsCacheService`
   (`api-gateway/src/services/permissions-cache.service.ts`): `GET perm:{userId}` (user id lower-cased) → hit returns
   the cached list; miss → user-service → `SET perm:{userId} … EX PERMISSIONS_CACHE_TTL_SECONDS`
   (default 60). **Explicit invalidation** after a *successful* upstream call only:
   `POST /api/users/:id/roles` and `DELETE /api/users/:id/roles/:roleId` delete that user's key;
   `PUT /api/roles/:id` and `DELETE /api/roles/:id` delete every `perm:*` key (`SCAN` + `DEL`,
   never `KEYS`), since any user may hold the role. An upstream error is passed through and
   invalidates nothing.
2. **Cache-aside for the catalog in recommendation-service, invalidated by events.**
   `RedisCatalogCache` (`recommendation-service/app/repositories/catalog_cache.py`) keeps the whole
   catalog under one key `rec:catalog:v1` (JSON) with `EX CATALOG_TTL_SECONDS` (default 300).
   The miss path keeps the single-flight `asyncio.Lock` (get → lock → get again → fetch → set), so
   concurrent misses load the catalog once (per process). Any cache miss within
   `RECENT_CATALOG_FETCH_REUSE_SECONDS` (2 s) of this process's last catalog fetch reuses that
   fetch (lock waiters, a Redis outage, or right after an invalidation), so while Redis is down
   the catalog is fetched at most once per 2 s per process.
   `ProductEventConsumer` listens on its own quorum queue
   `product-events.recommendation-service` (bound to `product.updated`, `product.deleted`) and
   **deletes the key**, then acks; the next recommendation reloads the catalog. It does not
   patch the cached entry: the event carries only `productId`, and a full reload is simple and
   always correct.
3. **Failure mode = bypass.** Redis errors never reach the caller.
   - Gateway (`ioredis`): no offline queue, one retry, 1 s connect timeout, 0.5 s command timeout
     (a Redis that stops answering fails the command fast); every error is logged
     and turns into a miss / no-op, so the guard calls user-service directly. The gateway boots
     without Redis and reconnects by itself.
   - recommendation-service (`redis.asyncio`): 0.5 s connect/socket timeout and **no client
     retries** (the miss path runs under the lock); every error is a miss / no-op, so each request
     reads product-service (no catalog cache; with the 2 s reuse above, at most once per 2 s per
     process). `GET /health/ready` reports `"redis": "error"`.
   - A failed `DEL` in the event handler is logged and the message is **still acked** — the TTL
     bounds the staleness, and redelivering would not help while Redis is down.
4. **Rate limit at the gateway only, with `@nestjs/throttler`.** One throttler, window
   `RATE_LIMIT_TTL_MS` (60 000 ms), limit chosen per route:

   | Routes | Limit per window | Env var |
   |---|---|---|
   | `POST /api/auth/register`, `/login`, `/forgot-password`, `/reset-password` | 5 | `RATE_LIMIT_AUTH` |
   | `POST /api/face-analysis/analyze` | 10 | `RATE_LIMIT_FACE_ANALYZE` |
   | `POST /api/events` | 60 | `RATE_LIMIT_EVENTS` |
   | every other route | 100 | `RATE_LIMIT_DEFAULT` |
   | `GET /health` | not limited (`@SkipThrottle()`, Docker healthcheck) | — |

   Over the limit → **429** with the usual error envelope, `error.code = TOO_MANY_REQUESTS` and
   the message "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút". Counters are kept per route.
   - **Storage (Q1): in memory** (the throttler's default). There is one gateway instance, so
     counters in RAM are exact. Running several gateway instances would need shared counters —
     switch to a Redis throttler storage then.
   - **Tracker (Q2): the `userId` when the request has a valid JWT, otherwise the client IP.** The
     throttler runs as a global guard *before* `JwtGuard`, so it verifies the token itself.
     Logged-in users behind one IP do not share a bucket.

## Alternatives considered

- **TTL only, no event invalidation.** Simplest, but an admin price change or delete stays
  invisible for up to the full TTL. Events already exist, so invalidation is almost free.
- **Update the cached catalog in place from the event** (re-fetch one product, patch the JSON).
  Fewer product-service calls, but more code and race conditions between patch and reload, for a
  catalog of a few hundred products. Delete-and-reload is enough.
- **Keep the in-process cache and only add the consumer.** Works with one replica, but the cache
  is lost on restart and the service cannot be scaled; Redis is already in the stack.
- **Put permissions into the JWT.** No lookup at all, but a role change would only apply when the
  token expires, which is worse than 60 s for removing admin rights.
- **Rate limit in each service.** Duplicated in four stacks; the gateway is the single entry
  point, so limiting there covers everything.

## Consequences

- **Eventual consistency, bounded.** Normally a product update or delete reaches recommendations
  within seconds (event → `DEL` → reload on the next call). The worst case is the TTL:
  - ≤ `CATALOG_TTL_SECONDS` (300 s) when a `product-events` message is lost (the publisher is
    best effort), when the `DEL` failed while Redis was down, for a **new product** (product-service
    publishes no `product.created`), and when a catalog fetch that started before the invalidation
    writes the old catalog back after it.
  - ≤ 2 s (`RECENT_CATALOG_FETCH_REUSE_SECONDS`) extra after an invalidation: any cache miss within 2 s
    of this process's last catalog fetch reuses that fetch.
  - ≤ `PERMISSIONS_CACHE_TTL_SECONDS` (60 s) for a role change made **outside the gateway**
    (directly in user-service or the DB) — only gateway routes invalidate the cache; when a guard
    miss read the old permissions and writes them back after the invalidation `DEL`; and when
    the `DEL` failed during a short Redis outage. In these cases a **revoked permission can still
    work for up to 60 s**.
- **Losing Redis costs latency, not correctness.** Both caches fall back to the owning service.
  Redis in compose has no volume (so its data is lost when the container is recreated) and no
  password (local only), which is fine for a cache.
- **Global product stats stay in process.** recommendation-service still caches its popularity
  stats (`TtlCache`) in memory for `CATALOG_TTL_SECONDS`; only the catalog moved to Redis.
- **Shared-IP buckets for guests.** Inside Docker every browser on the host reaches the gateway
  from the bridge gateway IP, and server-side rendering in `web` calls the gateway from one
  container IP. Anonymous callers therefore share one bucket per route. Accepted for local scope;
  `trust proxy` is not enabled because no reverse proxy sits in front of the gateway.
- **New dependency for two services.** `api-gateway` and `recommendation-service` now
  `depends_on` a healthy `redis` in `infra/docker-compose.yml`, though both keep working if it
  goes down later.
- **Queue arguments are fixed.** As in ADR 0004, `product-events.recommendation-service` must be
  deleted before its `x-*` arguments can change.
