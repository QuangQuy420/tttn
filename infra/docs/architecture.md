# Architecture

## Overview

Smart Eyewear is a **microservices** e-commerce system for eyeglasses with face-based
recommendation and virtual try-on. It runs **locally only** via Docker Compose.

## Style & principles

- **Monorepo, split-ready** — one git repo today with 9 sibling service folders (own Dockerfile
  and CI config each), kept structured so a future polyrepo split is a folder-by-folder extraction,
  not a rewrite.
- **Contracts in `infra/contracts`** — `product-service` publishes an OpenAPI file
  (`product-service.openapi.yaml`); `face-processing-service` and `recommendation-service` have
  Markdown HTTP contracts, and every RabbitMQ event contract (`order-checkout-saga.md`,
  `product-events.md`, `behavior-events.md`) is Markdown too. The other services have no
  published HTTP contract file yet; the shared response envelope and `X-Request-Id` rules are in
  `infra/contracts/README.md`.
- **Database-per-service** — one Postgres server, one database per service; services never read
  another service's tables. They integrate over internal REST or RabbitMQ events.
- **North-South vs East-West**
  - *North-South* (browser → system): all external traffic enters via the **API Gateway**
    (one origin, central CORS, edge JWT verification, permissions, rate limit, request id).
  - *East-West* (service ↔ service): **internal REST** (sync) when the caller needs an answer
    right away, and **RabbitMQ** (async) for everything that can happen later — see below.

## Components

| Component | Tech | Store |
|-----------|------|-------|
| api-gateway              | NestJS + TypeScript | Redis (permissions cache `perm:{userId}`, TTL 60 s) |
| user-service             | Spring Boot (Java) + Maven | Postgres `auth_db` |
| product-service          | NestJS + TypeScript | Postgres `product_db` + S3/MinIO (product images) |
| order-service            | Spring Boot (Java) + Maven | Postgres `order_db` + Redis (carts) |
| payment-service          | NestJS + TypeScript | Postgres `payment_db` (internal-only, driven by RabbitMQ) |
| face-processing-service  | Python + FastAPI + MediaPipe | Postgres `face_processing_db` + S3/MinIO (face images) |
| recommendation-service   | Python + FastAPI + XGBoost | Postgres `recommendation_db` (behavior events, impressions) + Redis (catalog cache `rec:catalog:v1`, TTL 300 s) |
| web                      | Next.js + TypeScript | — (MediaPipe + AR try-on run in the browser) |

Shared infrastructure in `infra/docker-compose.yml`: `postgres`, `redis`, `minio`, `rabbitmq`.
Redis has three separate uses — order-service carts (data), gateway permissions cache and
recommendation-service catalog cache (both caches only; losing them costs latency, not
correctness — ADR 0005).

## API Gateway (North-South)

- **Routing** — `/api/*` to the owning service: products / categories / brands / wishlist /
  reviews → product-service; auth / users / roles / permissions → user-service; cart / orders /
  admin orders + saga logs → order-service; face analysis → face-processing-service;
  recommendations → recommendation-service; admin AI models + behavior analytics
  (`/api/admin/ai/*`, `/api/admin/analytics/*`, permission `order:manage`) →
  face-processing-service / recommendation-service `/admin/*` with `X-Internal-Key`.
  `POST /api/events` publishes behavior events to
  RabbitMQ. `payment-service` is not routed (internal only).
- **Auth** — verifies the JWT at the edge (shared `JWT_SECRET`) and forwards the caller's id as
  `X-User-Id` to the internal services; admin routes also check the caller's current permissions
  (`PermissionsGuard`), read from the Redis cache or user-service on a miss. Every JWT route also
  rejects a revoked token (issued before the user's last password change / reset, or a user that
  is not `ACTIVE`), using the user's `status` / `tokensValidAfter` cached with the permissions
  (≤ 60 s). If user-service cannot answer (1.5 s timeout, 5xx, or a wrong `INTERNAL_API_KEY`)
  the JWT check fails open and `PermissionsGuard` fails closed. Id path params must be UUIDs
  (slug / saga-log date: a fixed pattern) and are URL-encoded before they are forwarded.
- **Rate limit** — `@nestjs/throttler`, one in-memory throttler, 60 s window, per user (valid
  JWT) or per IP, per route: 5 for register / login / forgot-password / reset-password, 10 for
  face analysis, 60 for `POST /api/events`, 100 for everything else; `/health` is never limited.
  Over the limit → 429 `TOO_MANY_REQUESTS` with a Vietnamese message. Details: ADR 0005.
- **Request id** — every request gets an `X-Request-Id` (kept from the client when valid),
  returned on every routed response (CORS preflights and body-parse errors excepted), forwarded on every downstream HTTP call and printed in the access
  log. recommendation-service and face-processing-service print the same id in their logs
  (`infra/contracts/README.md`).

## East-West communication

**Internal REST (sync)** — the caller needs the answer to continue:

- api-gateway → user-service (`/internal/v1/users/{id}/permissions`, `X-Internal-Key`).
- order-service → product-service (product / variant data for the cart and checkout).
- product-service → order-service (has the user bought this product? — for reviews).
- recommendation-service → product-service (catalog) and → face-processing-service (latest face
  analysis, `X-Internal-Key`).

**RabbitMQ (async, ADR 0002)** — the caller does not wait:

| Exchange | Producer → consumer | Purpose | Contract |
|---|---|---|---|
| `order-saga-events` | order-service ↔ product-service, payment-service | checkout saga: reserve stock → pay → commit / release (transactional outbox, ADR 0003) | `order-checkout-saga.md` |
| `product-events` | product-service → order-service, recommendation-service | `product.updated` / `product.deleted`: order-service syncs Redis carts; recommendation-service deletes its catalog cache (ADR 0005) | `product-events.md` |
| `behavior-events` | api-gateway, product-service, order-service → recommendation-service | user behavior (view, try-on, like, add to cart, purchase) for personalized ranking (ADR 0004) | `behavior-events.md` |

Each consumer owns its own durable queue with a dead-letter exchange, so a broken message ends
up in a DLQ instead of blocking the queue.

## Request flow (happy path)

```
browser → api-gateway → user-service              (register / login → JWT)
browser → api-gateway → product-service           (browse catalog, wishlist, reviews)
browser → api-gateway → face-processing-service   (upload photo → landmarks → face shape)    → S3/MinIO
browser (client-side)                             (virtual try-on: MediaPipe + Canvas 2D overlay)
browser → api-gateway → RabbitMQ behavior-events  (VIEW / TRY_ON; LIKE, ADD_TO_CART, PURCHASE come from the services)
                         RabbitMQ → recommendation-service (stores interactions)
browser → api-gateway → recommendation-service    (FinalScore = α·PreferenceScore + β·FaceFitScore)
                         → Redis catalog cache / product-service, face-processing-service
browser → api-gateway → order-service             (cart in Redis → checkout)
                         order-service ⇄ RabbitMQ order-saga-events ⇄ product-service (stock), payment-service (payment)
browser → api-gateway → order-service             (cancel a paid order → refund + restock over order-saga-events)
```

## Cross-cutting decisions

- **Languages** — NestJS + TypeScript (`api-gateway`, `product-service`, `payment-service`),
  Spring Boot + Java (`user-service`, `order-service`), Python + FastAPI (`face-processing-service`,
  `recommendation-service`), Next.js (`web`).
- **JWT** — `user-service` issues the token; the gateway verifies it at the edge with the shared
  `JWT_SECRET` and forwards `X-User-Id` to internal services. Internal-only endpoints are
  protected with `X-Internal-Key`.
- **Monorepo** — one git repo, split-ready (see above). Contracts are shared as versioned copies
  — [ADR 0001](adr/0001-contract-sharing-mechanism.md).
- **Event bus** — RabbitMQ — [ADR 0002](adr/0002-event-bus-selection.md).
- **Checkout saga** — transactional outbox + idempotent checkout —
  [ADR 0003](adr/0003-transactional-outbox-and-idempotency.md).
- **Behavior events** — RabbitMQ, consumer-side dedupe by `eventId` —
  [ADR 0004](adr/0004-behavior-events-over-rabbitmq.md).
- **Caching + rate limit** — Redis cache-aside with event invalidation; in-memory gateway rate
  limit — [ADR 0005](adr/0005-redis-cache-and-event-invalidation.md).
- **Face image storage** — S3, local via MinIO; private bucket + presigned URLs.

## Layered design (per backend service)

`routes (controller) → services (business) → repositories (data access) → db`, wired with
dependency injection. See the root `README.md` for the full diagram and SOLID notes.

## Known local-only constraints

- **Webcam** (`getUserMedia`) only works on `localhost`/HTTPS → open the web app at
  `http://localhost:3000`.
- **MediaPipe in Docker** — wheels are architecture-sensitive (x86 vs Apple Silicon);
  pin a known-good base image / use `platform: linux/amd64` if needed.
- **Guests share a rate-limit bucket** — inside Docker all host browsers reach the gateway from
  the same bridge IP, so anonymous callers share one bucket per route (ADR 0005).

## Known issues

- **user-service config drift (owned by the teammate, not fixed here).**
  In Docker the service is consistent: `UserServiceApplication.applyEnvOverrides()` maps `PORT`,
  `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_API_KEY` and `JWT_EXPIRES_IN` onto the Spring
  properties before Spring starts, so with `user-service/.env` (`PORT=3001`, `auth_db`) it listens
  on 3001 and uses `auth_db`, matching the compose healthcheck (`${PORT:-3001}`) and the gateway's
  `USER_SERVICE_URL=http://user-service:3001`. The leftover drift: the `Dockerfile` still says
  `EXPOSE 8081`, and the non-Docker defaults in `application.yml` are port `8081` and
  `jdbc:postgresql://localhost:5433/user_service` (used only when those env vars are not set).
