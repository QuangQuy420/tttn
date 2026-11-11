# Smart Eyewear — Face-based Recommendation E-commerce (Microservices)

A graduation-internship (TTTN) project: an **e-commerce platform for eyeglasses** that
**analyzes the customer's face from an uploaded photo**, **recommends frames that suit their
face shape**, and offers **virtual try-on (AR)** — all built on a **microservices**
architecture and runnable **locally** with a single `docker-compose up`.

> 🖥️ **Scope: LOCAL only.** No cloud/production deployment (no k8s, no managed servers,
> no domain/HTTPS, no CD). "Deploy" here means the whole system runs on a dev machine via
> Docker Compose.

---

## End-to-end flow

```
register / login
   → browse catalog
   → upload face photo
   → face analysis (landmarks → face shape + measurements)
   → frame recommendation (face shape + the user's behavior)
   → virtual try-on (AR, in the browser)
   → add to cart → checkout → order history
```

---

## Architecture

- **Monorepo, split-ready** — one git repo holding every service as a sibling folder
  (`api-gateway`, `product-service`, `user-service`, `order-service`, `payment-service`,
  `face-processing-service`, `recommendation-service`, `web`, `infra`). Each service owns its
  own `Dockerfile`, so splitting one out into its own repo later is a folder extraction, not a
  rewrite.
- **North-South** (browser → system) goes through a single **API Gateway** (routing, CORS,
  edge JWT verification, permissions, rate limit, `X-Request-Id`). Rate limit: per user (valid
  JWT) or per IP, per route, in a 60 s window — 5 for register / login / forgot / reset password,
  10 for face analysis, 60 for behavior events, 100 for the rest; over it → **429** with a
  Vietnamese message. `/health` is never limited.
- **East-West** (service ↔ service) uses internal **REST** (sync) when the caller needs an
  answer right away, and **RabbitMQ** (async) for the rest:
  - checkout saga (`order-saga-events`): `order-service` ⇄ `product-service` (stock) and
    `payment-service` (payment), with a transactional outbox;
  - `product-events` (`product.updated` / `product.deleted`): `order-service` syncs Redis carts,
    `recommendation-service` clears its catalog cache;
  - `behavior-events` (view, try-on, like, add to cart, purchase) → `recommendation-service`.
- **Database-per-service** (one Postgres server, a separate database per service for local dev).
- **Redis** — `order-service` carts (data), plus two caches: the gateway's permissions cache
  (60 s) and `recommendation-service`'s product catalog (300 s, cleared by `product-events`).
  The caches are never the source of truth: if Redis is down, both services keep working, just
  slower.
- **Request id** — every request gets an `X-Request-Id` at the gateway; the same id shows up in
  the logs of the gateway, `recommendation-service` and `face-processing-service`.
- Architecture details and ADRs: `infra/docs/architecture.md`, `infra/docs/adr/`.
- Face images are stored in **S3** — locally via **MinIO** (S3-compatible), so switching to
  real S3 later needs no code change.

```
            ┌─────────────┐
 browser ──▶│ api-gateway │──┬─▶ user-service            (Postgres: auth_db)
            │ (Redis:     │  ├─▶ product-service         (Postgres: product_db, MinIO)
            │  perm cache)│  ├─▶ order-service            (Postgres: order_db + Redis carts)
            └─────────────┘  ├─▶ face-processing-service  (FastAPI + MediaPipe, Postgres, S3/MinIO)
                             └─▶ recommendation-service   (FastAPI + XGBoost, Postgres: recommendation_db,
                                                           Redis catalog cache; reads product-service
                                                           + face-processing-service)

 RabbitMQ:
   order-saga-events  order-service ⇄ product-service, payment-service (Postgres: payment_db)
   product-events     product-service → order-service, recommendation-service
   behavior-events    api-gateway, product-service, order-service → recommendation-service

 web (Next.js) ── runs the AR try-on client-side
```

---

## Repositories

| Repo | Language | Responsibility |
|------|----------|----------------|
| **`api-gateway`** | **NestJS + TypeScript** | Single entry point; routing, CORS, edge JWT verify, permissions (cached in Redis), rate limit, request id (North-South) |
| **`user-service`** | **Spring Boot (Java) + Maven** | Register / login, JWT, roles & permissions, user profile, saved addresses |
| **`product-service`** | **NestJS + TypeScript** | Products, categories, frame attributes, variants/inventory, list/detail/search |
| **`order-service`** | **Spring Boot (Java) + Maven** | Cart (Redis), checkout, orders, order history (delegates payment to `payment-service` over RabbitMQ) |
| **`payment-service`** | **NestJS + TypeScript** | Processes checkout payments for `order-service` (mock provider), payment status/history |
| **`face-processing-service`** | **Python + FastAPI** | Face landmark detection (MediaPipe) → face shape + measurements |
| **`recommendation-service`** | **Python + FastAPI** | Hybrid ranking `finalScore = α·preferenceScore (XGBoost on user behavior) + β·faceFitScore`; stores behavior events from RabbitMQ; catalog cached in Redis |
| **`web`** | **Next.js + TypeScript** | Storefront, auth UI, upload, recommendations, virtual try-on (AR), admin dashboard |
| **`infra`** | Docker Compose + GitHub Actions | `docker-compose.yml`, seed data, shared API contracts, docs/ADRs (local only) |

> ✅ **All nine services are real and build**, and every Compose container has a
> healthcheck. See
> `infra/README.md` for whatever's still in progress on a given service.

---

## Code structure (business backend services)

Every backend service follows a strict layered flow with **dependency injection** and
**SOLID** principles. Dependencies point **inward** — outer layers depend on inner ones,
never the reverse.

```
HTTP request
   │
   ▼
┌──────────────┐   route / controller layer
│   routes/    │   - parse & validate input (DTOs), map HTTP ↔ domain
│              │   - NO business logic here
└──────┬───────┘
       ▼
┌──────────────┐   service layer (business logic)
│  services/   │   - use-cases, orchestration, rules
│              │   - depends on repository *interfaces*, not concrete DB
└──────┬───────┘
       ▼
┌──────────────┐   repository layer (data access)
│ repositories/│   - the ONLY layer that talks to the database
│              │   - exposes interfaces; implementations are injected
└──────┬───────┘
       ▼
┌──────────────┐   db layer
│     db/      │   - entities/models, migrations, connection/ORM setup
└──────────────┘

config/        - DI container wiring, env/config, app bootstrap
middlewares/   - cross-cutting (auth guard, error handler, logging)
tests/         - unit (services, repos) + integration
```

**Principles applied**
- **SRP** — each layer has one reason to change; controllers don't query the DB.
- **DIP** — services depend on repository *interfaces*; concrete implementations are
  provided by the DI container (swap DB/mock freely).
- **OCP/LSP/ISP** — small, focused interfaces; new behavior added by new implementations,
  not by editing callers.
- **Reuse over duplication** — shared logic extracted; contracts shared via `infra/contracts`.

The Python services (`face-processing-service`, `recommendation-service`) mirror the same
layering: `app/routers` → `app/services` → `app/repositories` → `app/db`, with
`app/schemas` (Pydantic DTOs) and `app/core` (config + DI). The NestJS services
(`api-gateway`, `product-service`) mirror it with Nest's own building blocks: `*.controller.ts`
→ `*.service.ts` → `*.repository.ts` → TypeORM/Prisma entities, organized as feature
**modules** (`*.module.ts`) with `dto/` (class-validator DTOs) and providers wired through
Nest's DI container. The Spring Boot services (`user-service`, `order-service`) mirror it with
Spring's own building blocks: `controller/` → `service/` (interface) + `service/impl/` →
`repository/` (Spring Data JPA) → `entity/`, with `dto/request`/`dto/response` records,
`exception/` for a shared `BusinessException`/`ErrorCode` pattern, and Flyway migrations under
`resources/db/migration`. The `web` repo (Next.js) keeps its own structure with a `lib/api`
client layer that talks only to the gateway.

---

## Running locally

> Prerequisite: Docker Desktop / Docker Engine.

```bash
# 1. Provide environment values
cp infra/.env.example infra/.env
# copy each service env too:
for s in api-gateway user-service product-service order-service payment-service face-processing-service recommendation-service web; do cp $s/.env.example $s/.env; done

# 2. Bring the whole system up
cd infra
docker compose up --build
```

- Web app:       http://localhost:3000
- API gateway:   http://localhost:8080
- MinIO console: http://localhost:9001
- RabbitMQ management UI: http://localhost:15672

> 🗄️ **Database migrations run automatically — no manual step needed.** `user-service` and
> `order-service` (Spring Boot) run their Flyway migrations on startup; `product-service` and
> `payment-service` (NestJS) run pending TypeORM migrations from their container's
> `entrypoint.sh` before the app boots. This happens on every `docker compose up --build`, not
> just the first one.
>
> `product-service` still needs catalog seed data before there's anything to browse — that's a
> separate, one-off step: `cd product-service && npm run seed` (or, against the running
> container, `docker compose exec product-service node dist/seed.js`). See `infra/README.md`.
>
> If Postgres fails to start with "port is already allocated", another local Postgres is
> already using 5432 — add a gitignored `infra/docker-compose.override.yml` remapping
> `postgres`'s `ports` to a free host port (Compose auto-loads it, no extra flags needed).

---
