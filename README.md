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
   → frame recommendation (by face shape)
   → virtual try-on (AR, in the browser)
   → add to cart → checkout → order history
```

---

## Architecture

- **Polyrepo — 8 independent repos** (this workspace holds them as sibling folders for local dev).
- **North-South** (browser → system) goes through a single **API Gateway** (routing, CORS,
  edge JWT verification, rate-limit).
- **East-West** (service ↔ service) is internal **REST** (sync). A message broker is a
  future enhancement, not used now.
- **Database-per-service** (one Postgres server, a separate database per service for local dev).
- Face images are stored in **S3** — locally via **MinIO** (S3-compatible), so switching to
  real S3 later needs no code change.

```
            ┌─────────┐
 browser ──▶│ gateway │──┬─▶ auth      (Postgres: auth_db)
            └─────────┘  ├─▶ catalog   (Postgres: catalog_db)
                         ├─▶ order     (Postgres: order_db + Redis)
                         ├─▶ face      (FastAPI + MediaPipe, S3/MinIO)
                         └─▶ reco      (FastAPI; reads catalog)
 web (Next.js) ── runs the AR try-on client-side
```

---

## Repositories

| Repo | Language | Responsibility |
|------|----------|----------------|
| **`gateway`** | _TBD — Q2 (NestJS / Spring Boot / Go)_ | Single entry point; routing, CORS, edge JWT verify, rate-limit (North-South) |
| **`auth`** | _TBD — Q2_ | Register / login, JWT, user profile |
| **`catalog`** | _TBD — Q2_ | Products, categories, frame attributes, list/detail/search |
| **`order`** | _TBD — Q2_ | Cart (Redis), checkout, orders, history (payment mocked) |
| **`face`** | **Python + FastAPI** | Face landmark detection (MediaPipe) → face shape + measurements |
| **`reco`** | **Python + FastAPI** | Face shape (+ filters) → ranked frame recommendations (content-based) |
| **`web`** | **Next.js + TypeScript** | Storefront, auth UI, upload, recommendations, virtual try-on (AR), light admin |
| **`infra`** | Docker Compose + GitHub Actions | `docker-compose.yml`, seed data, shared API contracts, docs/ADRs (local only) |

> ⛔ **Backend language for `gateway` / `auth` / `catalog` / `order` is not decided yet
> (Open Question Q2).** Their folders are scaffolded language-agnostically and their
> Dockerfiles are placeholders. Fill them in once the team locks the stack.

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

The Python services (`face`, `reco`) mirror the same layering: `app/routers` → `app/services`
→ `app/repositories` → `app/db`, with `app/schemas` (Pydantic DTOs) and `app/core`
(config + DI). The `web` repo (Next.js) keeps its own structure with an `lib/api` client
layer that talks only to the gateway.

---

## Running locally

> Prerequisite: Docker Desktop / Docker Engine.

```bash
# 1. Provide environment values
cp infra/.env.example infra/.env
# copy each service env too:
for s in gateway auth catalog order face reco web; do cp $s/.env.example $s/.env; done

# 2. Bring the whole system up
cd infra
docker compose up --build
```

- Web app:     http://localhost:3000
- API gateway: http://localhost:8080
- MinIO console: http://localhost:9001

> ⚠️ Backend services with `Language: TBD` won't build until Q2 is decided and their
> Dockerfiles are completed.

---
