# Smart Eyewear — Face-based Recommendation E-commerce (Microservices)

A graduation-internship (TTTN) project: an **e-commerce platform for eyeglasses** that
**analyzes the customer's face from a photo**, **recommends frames that suit their face shape
and their behavior**, and offers **virtual try-on (AR)** in the browser — built on a
**microservices** architecture and runnable **locally** with a single `docker compose up`.

> 🖥️ **Scope: LOCAL only.** No cloud/production deployment (no k8s, no managed servers,
> no domain/HTTPS, no CD). "Deploy" here means the whole system runs on a dev machine via
> Docker Compose. CI (build + test per service) runs on GitHub Actions.

The storefront and every user-facing message are in **Vietnamese**.

---

## End-to-end flow

```
register / login
   → browse catalog (filters, wishlist, reviews)
   → upload or capture a face photo
   → face analysis (landmarks → measurements → face shape + probabilities)
   → frame recommendation (face shape + the user's behavior)
   → virtual try-on (AR, in the browser — live camera or on the uploaded photo)
   → add to cart → checkout (saga: reserve stock → pay) → order history
```

| Step | Web page | Owning service |
|---|---|---|
| Register, login, forgot / reset / change password, profile, address book | `/register`, `/login`, `/forgot-password`, `/reset-password`, `/change-password`, `/profile` | `user-service` |
| Catalog, product detail, wishlist, reviews | `/`, `/products/[slug]`, `/wishlist` | `product-service` |
| Face analysis + history | `/face-analysis` | `face-processing-service` |
| Recommendations ("Dành cho bạn" on the home page, list per face shape) | `/`, `/recommendations?faceShape=` | `recommendation-service` |
| Virtual try-on | `/try-on`, `/products/[slug]/try-on`, photo try-on on `/face-analysis` | browser only |
| Cart, checkout, orders | `/cart`, `/checkout`, `/orders`, `/orders/[id]` | `order-service` (+ `product-service`, `payment-service` through the saga) |
| Admin | `/admin/*` | all of the above, through the gateway |

---

## Architecture

- **Monorepo, split-ready** — one git repo holding every service as a sibling folder. Each
  service owns its own `Dockerfile`, so splitting one out into its own repo later is a folder
  extraction, not a rewrite.
- **North-South** (browser → system) goes through a single **API Gateway**. See
  [API Gateway](#api-gateway).
- **East-West** (service ↔ service) uses internal **REST** (sync) when the caller needs an
  answer right away, and **RabbitMQ** (async) for the rest. See
  [Service-to-service communication](#service-to-service-communication).
- **Database-per-service** — one Postgres server, a separate database per service
  (`auth_db`, `product_db`, `order_db`, `payment_db`, `face_processing_db`,
  `recommendation_db`). A service never reads another service's tables.
- **Redis** — three separate uses: `order-service` carts (data), the gateway's permissions
  cache and `recommendation-service`'s product catalog cache. The two caches are never the
  source of truth: if Redis is down, both services keep working, just slower.
- **Object storage** — S3 API, locally via **MinIO**. Two buckets, each created by its owning
  service on startup: `product-images` (public-read, `product-service`) and `face-images`
  (private, `face-processing-service`, read through presigned URLs valid for 1 hour).
- Architecture details and ADRs: `infra/docs/architecture.md`, `infra/docs/adr/`. Contracts:
  `infra/contracts/`.

```
            ┌─────────────┐
 browser ──▶│ api-gateway │──┬─▶ user-service            (Postgres: auth_db)
            │ (Redis:     │  ├─▶ product-service         (Postgres: product_db, MinIO: product-images)
            │  perm cache)│  ├─▶ order-service           (Postgres: order_db + Redis carts)
            └──────┬──────┘  ├─▶ face-processing-service (FastAPI + MediaPipe + SVM,
                   │         │                            Postgres: face_processing_db, MinIO: face-images)
                   │         └─▶ recommendation-service  (FastAPI + XGBoost, Postgres: recommendation_db,
                   │                                      Redis catalog cache; reads product-service
                   │                                      + face-processing-service)
                   ▼
 RabbitMQ:
   order-saga-events  order-service ⇄ product-service (stock), payment-service (Postgres: payment_db)
   product-events     product-service → order-service, recommendation-service
   behavior-events    api-gateway, product-service, order-service → recommendation-service

 web (Next.js) ── talks only to the gateway; runs the AR try-on client-side
```

---

## Repository layout

| Folder | Stack | Responsibility |
|------|----------|----------------|
| **`api-gateway`** | NestJS 11 + TypeScript | Single entry point: routing, CORS, edge JWT verify, permissions (cached in Redis), rate limit, request id, uniform error envelope; publishes the browser's behavior events to RabbitMQ |
| **`user-service`** | Spring Boot 3 (Java) + Maven | Register / login, JWT, forgot / reset / change password, roles & permissions (RBAC), profile, address book |
| **`product-service`** | NestJS + TypeScript + TypeORM | Products, brands, categories, variants + stock, images (MinIO, incl. the try-on PNG), wishlist, reviews; stock reservation in the checkout saga |
| **`order-service`** | Spring Boot 4 (Java) + Maven | Cart (Redis), checkout, orders, saga orchestration with a transactional outbox, saga logs, reconciliation job |
| **`payment-service`** | NestJS + TypeScript + TypeORM | Mock payment for the checkout saga; driven only by RabbitMQ (not routed by the gateway) |
| **`face-processing-service`** | Python + FastAPI | MediaPipe face landmarks → geometric features → face-shape classifier (calibrated SVM, rule-based fallback); analysis history |
| **`recommendation-service`** | Python + FastAPI | Hybrid ranking `finalScore = α·preferenceScore + β·faceFitScore`; stores behavior events; behavior analytics |
| **`web`** | Next.js 16 + React 19 + TypeScript | Storefront, face analysis UI, recommendations, virtual try-on (AR), admin dashboard |
| **`infra`** | Docker Compose | `docker-compose.yml`, hot-reload overlay, Postgres init script, seed data, shared contracts, docs/ADRs |
| **`ml`** | Python (offline) | Training pipelines for the two models. Not a service, not in Compose — see [Machine learning](#machine-learning-offline) |
| `.github/workflows/ci.yml` | GitHub Actions | CI: one job per service, run only when that service's folder changed |

> ✅ **All eight services are real and build** (seven backend services + `web`). Compose runs
> **12 containers**: those eight plus `postgres`, `redis`, `minio`, `rabbitmq`. Every container
> has a healthcheck, and the eight service containers restart by themselves when their process
> exits (`restart: unless-stopped`).

---

## API Gateway

All public routes are `/api/...` (plus `/health`). The gateway forwards each one to the owning
service and passes downstream errors through unchanged; a downstream timeout becomes **504**,
an unreachable service **503**.

| Public path | Goes to | Access |
|---|---|---|
| `/api/auth/*` (register, login, forgot-password, reset-password) | user-service | public |
| `/api/users/me*`, `/api/users/change-password` | user-service | logged in |
| `/api/users`, `/api/users/:id/roles` | user-service | `user:manage-roles` |
| `/api/roles`, `/api/permissions` | user-service | `role:manage` |
| `GET /api/products*`, `/api/categories`, `/api/brands`, product reviews (read) | product-service | public (only `PUBLISHED` products; `product:manage` also sees drafts) |
| product / variant / image writes, `/api/admin/reviews` | product-service | `product:manage` |
| category / brand writes | product-service | `catalog:manage` |
| `/api/wishlist*`, own review (create / edit / delete) | product-service | logged in |
| `/api/cart*`, `/api/orders*` | order-service | logged in |
| `/api/admin/orders*`, `/api/admin/saga-logs*` | order-service | `order:manage` |
| `/api/admin/saga-settings` | order-service | `saga-settings:manage` |
| `/api/face-analysis/*` (analyze, history) | face-processing-service | logged in |
| `POST /api/recommendations` | recommendation-service | public (personalized when logged in) |
| `GET /api/recommendations/for-you` | recommendation-service | logged in |
| `/api/admin/ai/*`, `/api/admin/analytics/*` | face-processing-service / recommendation-service | `order:manage` |
| `POST /api/events` | RabbitMQ `behavior-events` | public (events of anonymous users are dropped) |

- **Auth** — `user-service` issues an HS256 JWT (claims: username, `userId`, `email` — no roles
  inside). The gateway verifies it with the shared `JWT_SECRET` and forwards the caller as
  `X-User-Id` (or in the URL path for `order-service`). The backend services trust the gateway;
  internal-only endpoints (`/internal/*`, `/admin/*` of the Python services) require
  `X-Internal-Key`. Id path params must be UUIDs, a product slug and the saga-log date must
  match a fixed pattern (else 400); params are URL-encoded before they are forwarded. Uploads are capped at 10 MB (face photo) and 5 MB (product image) → 413.
- **Token revocation** — a password change or reset makes every older token invalid, and a
  user that is not `ACTIVE` is rejected. user-service checks this on its own routes; the gateway
  checks it on every JWT route from the cached user state (below), so it applies within 60 s
  (at once for the user's own password change). The web then logs the user out. If the
  gateway cannot get the user state (user-service down or slower than 1.5 s, or a wrong
  `INTERNAL_API_KEY`), the JWT check fails open (signature + expiry only, logged) and
  permission-guarded routes fail closed.
- **Permissions** — not stored in the token. For admin routes the gateway reads the caller's
  current permissions (plus `status` / `tokensValidAfter`) from `user-service`
  (`/internal/v1/users/{id}/permissions`) and caches them in Redis (`perm:{userId}`, 60 s). The cache is cleared when roles change or the user changes
  their password through the gateway. Seeded roles: `ADMIN` (all six permissions above) and `CUSTOMER` (none).
- **Rate limit** — in-memory (`@nestjs/throttler`), per user (valid JWT) or per IP, per route,
  in a 60 s window: 5 for register / login / forgot / reset password, 10 for
  `POST /api/face-analysis/analyze`, 60 for `POST /api/events`, 100 for the rest. Over it →
  **429** `TOO_MANY_REQUESTS` with a Vietnamese message. `/health` is never limited. All
  limits are configurable in `api-gateway/.env`.
- **Request id** — every request gets an `X-Request-Id` (a valid one sent by the client is
  kept). It is returned on the response, sent on every downstream call, and printed in the logs
  of the gateway, `recommendation-service` and `face-processing-service`.

---

## Service-to-service communication

**Internal REST (sync)**

- api-gateway → user-service — the caller's permissions.
- order-service → product-service — live product / variant data for the cart and checkout.
- product-service → order-service — "has this user bought this product?" (required to review).
- recommendation-service → product-service (catalog) and → face-processing-service (the
  user's face analysis).

**RabbitMQ (async)** — three topic exchanges. Each consumer owns a durable quorum queue with a
dead-letter queue, so a broken message does not block the queue.

| Exchange | Producer → consumer | Purpose | Contract |
|---|---|---|---|
| `order-saga-events` | order-service ⇄ product-service, payment-service | checkout saga | `infra/contracts/order-checkout-saga.md` |
| `product-events` | product-service → order-service, recommendation-service | `product.updated` / `product.deleted`: order-service refreshes the item snapshots in Redis carts; recommendation-service deletes its catalog cache | `infra/contracts/product-events.md` |
| `behavior-events` | api-gateway, product-service, order-service → recommendation-service | user behavior for personalized ranking | `infra/contracts/behavior-events.md` |

---

## Main features in detail

### 1. Face analysis (`face-processing-service`)

`POST /api/face-analysis/analyze` (multipart `file`; jpeg / png / webp; over 10 MB → 413 at
the gateway, over `FACE_MAX_PIXELS` = 25 million pixels → 400):

1. **Landmarks** — MediaPipe `FaceLandmarker` returns 478 landmarks and a head-pose matrix.
2. **Quality gates** (each fails with 400 and a Vietnamese message): exactly one face; head
   yaw at most 25°; cheekbone width at least 80 px.
3. **Features** — 7 measurements shown to the user (face length, forehead / cheekbone / jaw
   width and 3 ratios) and 20 normalized geometric features for the model.
4. **Classification** into one of 6 shapes — `ROUND`, `SQUARE`, `OVAL`, `HEART`, `DIAMOND`,
   `OBLONG` — with a probability per shape. Default classifier: a calibrated **SVM (RBF)**
   (`FACE_SHAPE_CLASSIFIER=ml`, model `v2-full-real-20261005-svm`). `FACE_SHAPE_CLASSIFIER=rule`
   switches to the older threshold rules.
5. **Storage** — the photo goes to the private `face-images` bucket; the result (shape,
   measurements, probabilities, model version) to the `face_analyses` table.

The user can list and delete their past analyses (`/api/face-analysis/history`).

> Model quality (from the model card, test split of 701 images): accuracy **0.54**,
> macro-F1 **0.49**. `SQUARE` and `OBLONG` are recognized well (F1 ≈ 0.77–0.79); `DIAMOND` is
> weak (F1 ≈ 0.12, very few samples). The web shows a hint when confidence is under 70%.

### 2. Recommendations (`recommendation-service`)

```
finalScore = α · preferenceScore + β · faceFitScore      (defaults α = 0.6, β = 0.4)
```

- **`preferenceScore`** — an **XGBoost ranker** (`rank:ndcg`, 63 features about the user, the
  product and their match), rank-normalized to [0, 1] over the candidate list. A user with no
  behavior yet (cold start), or a service started without a model, gets time-decayed product
  **popularity** instead.
- **`faceFitScore`** — the user's face-shape probabilities multiplied by a fixed
  face-shape → frame-shape suitability table (`app/core/face_shape_mapping.py`). `β = 0` when
  the user has no face analysis.
- **Two endpoints** — `POST /api/recommendations` ranks the catalog for a given face shape
  (guests allowed). `GET /api/recommendations/for-you` is the personal list: it uses the user's
  latest analysis, leaves out products already purchased, allows at most 3 items per frame
  shape and per brand in the top 10, and logs one impression row per call.
- Each item carries up to two Vietnamese **reasons** (e.g. "Hợp dáng mặt Oval",
  "Giống kiểu gọng bạn hay xem").
- **Catalog cache** — the whole catalog is cached in Redis (`rec:catalog:v1`, 300 s) and
  deleted on `product.updated` / `product.deleted`. A newly created product has no event and
  shows up after the TTL at the latest.

**Behavior events** feed the ranker (stored once each in `interactions`, de-duplicated by
`eventId`):

| Event | Sent by | When | Weight |
|---|---|---|---|
| `VIEW` | web → gateway | logged-in user stays ≥ 2 s on a product page | 1 |
| `TRY_ON` | web → gateway | ≥ 3 s of live try-on with one frame, or a photo try-on | 2 |
| `LIKE` / `UNLIKE` | product-service | wishlist add / remove | 3 / cancels the like |
| `ADD_TO_CART` | order-service | item added to the cart | 4 |
| `PURCHASE` | order-service (outbox) | order confirmed, one event per item | 5 |

> The served ranker (`v1-sim-20261110-xgbrank`) is trained on **simulated** behavior data
> (test NDCG@10 **0.24**, HitRate@10 **0.45**), because the project has no real traffic.

### 3. Virtual try-on (`web`)

Runs fully in the browser — no image or video is sent to the server.

- MediaPipe `FaceLandmarker` (`@mediapipe/tasks-vision`, GPU with CPU fallback) tracks the face
  in the camera stream; the frame image is drawn on a **Canvas 2D** overlay.
- Pose: position from the nose bridge, width from the outer eye corners (scaled by the frame's
  real width in mm when known), roll from the eye line, yaw from the head-pose matrix.
- A **One Euro filter** smooths position, size and rotation; a short hold + fade hides
  flicker when the face is lost for a moment.
- Each product needs one transparent PNG (image kind `TRY_ON`); the seed gives one to every
  product.
- `?debug=1` on a try-on page shows FPS / latency and can record a benchmark of the filters.
- The MediaPipe WASM + model load from a CDN by default (the browser needs internet). To
  self-host, run `web/scripts/fetch-mediapipe-assets.sh` and set `NEXT_PUBLIC_MEDIAPIPE_BASE`.

### 4. Cart and checkout saga (`order-service`, `product-service`, `payment-service`)

**Cart** — stored in Redis (`cart:{userId}`, TTL `CART_EXPIRATION_DAYS`, default 7 days). Each
item keeps a snapshot of the product (name, price, image, stock) that is refreshed when the
product changes. An item that is no longer available stays in the cart with a label but is not
counted in the total or the cart badge. Concurrent writes to one cart are serialized by a short
Redis lock.

**Checkout** — `POST /api/orders/checkout` checks the selected cart items against live prices
and stock (any difference → **409** and the cart is refreshed), creates the order as `PENDING`
and returns **201** right away. The saga then runs in the background:

```
checkout → order PENDING
  └─ stock.reserve.requested ─▶ product-service reserves stock (all items or none)
       ├─ stock.reserve.rejected ─▶ order CANCELLED
       └─ stock.reserved ─▶ order AWAITING_PAYMENT
            └─ payment.create.requested ─▶ payment-service
                 ├─ payment.completed ─▶ order CONFIRMED + PAID; product-service commits the
                 │                       stock; PURCHASE events; ordered items leave the cart
                 └─ payment.failed ─▶ order CANCELLED + stock.release.requested (compensation)

cancel a CONFIRMED (paid) order → order CANCELLED
  ├─ payment.refund.requested ─▶ payment-service (mock refund) ─ payment.refunded ─▶ paymentStatus REFUNDED
  └─ stock.restock.requested ─▶ product-service puts the committed stock back
```

- **Transactional outbox** (`order-service`) — every saga command is written to
  `outbox_events` in the same DB transaction as the order change, then a relay publishes it
  (every ~1 s, with publisher confirms and retry with backoff). Checkout therefore still
  succeeds while RabbitMQ is down; the saga continues when the broker is back.
- **Idempotent checkout** — the web sends an `Idempotency-Key` header. The same key + the same
  body within 24 h returns the first response (`Idempotent-Replayed: true`) instead of creating
  a second order; the same key + a different body → 409.
- **Idempotent consumers** — every consumer checks the order's / reservation's current state
  before acting, so a duplicated or late message is a safe no-op.
- **Refund** — cancelling a `CONFIRMED` order (by the customer or an admin) refunds the mock
  payment and restocks the items, as above. A `payment.completed` that arrives after the order
  was cancelled triggers the same refund + restock. Refund / restock commands stay in the
  outbox until they are sent (never given up). Cancelling a `PENDING` / `AWAITING_PAYMENT` order
  releases the reserved stock.
- **Concurrent updates** — orders use optimistic locking: a write that loses a race fails with
  **409** (HTTP) or is retried (saga messages, reconciliation).
- **Reconciliation job** — resends the command for orders stuck in `PENDING` /
  `AWAITING_PAYMENT`, and cancels them (releasing stock) after the configured number of
  attempts. Interval, threshold and attempts are editable at `/admin/settings`.
- **Saga logs** — every step is recorded per order and shown at `/admin/saga-logs`.
- **Payment is a mock** — only `CARD` is accepted (the only method the web offers). A payment
  succeeds when the order total is at least `PAYMENT_MIN_CARD_AMOUNT` (default 1,000,000) and
  fails below it, which makes both saga branches easy to demo.

**Order statuses** — `PENDING → AWAITING_PAYMENT → CONFIRMED → PROCESSING → SHIPPING →
DELIVERED → COMPLETED`, or `CANCELLED`. The saga drives the first three; an admin can only move
the order on one step at a time from `CONFIRMED` (`CONFIRMED → PROCESSING → SHIPPING →
DELIVERED → COMPLETED`). The customer or an admin can cancel while the order is `PENDING`,
`AWAITING_PAYMENT` or `CONFIRMED` (a paid order is refunded); from `PROCESSING` on it cannot be
cancelled.

### 5. Catalog, wishlist and reviews (`product-service`)

- Product list with filters (category, brands, frame shape, face shape, gender, material,
  color, price range, name search), sorting (newest, price, rating) and pagination.
- **Draft visibility** — the storefront only sees `PUBLISHED` products: a `DRAFT` / `ARCHIVED`
  product is left out of the list and its detail and reviews return 404. Admins with
  `product:manage` see every status (`includeAllStatuses=true`, forwarded by the gateway only
  for them).
- **Variant stock** — the stock an admin enters is the new *available* stock (reserved units are
  added on top), and changing a variant's color, size or price does not touch its stock.
- A product has variants (color + size, each with its own stock) and images (`GALLERY` or the
  single `TRY_ON` PNG) stored in MinIO.
- **Reviews** — one per user per product, only for users who bought it (checked with
  `order-service`). A review is published at once; an admin can hide it.

### 6. Admin (`web` `/admin`)

Dashboard, products / brands / categories, review moderation, orders (status updates), saga
logs and saga settings, users and roles, AI model info (`/admin/ai-models`) and behavior
analytics (`/admin/analytics`: events per day, funnel, top products, face-shape distribution).
The gateway enforces the permissions; the web only hides what the user cannot open.

---

## Known limitations

- **No email.** The password-reset token is only written to the `user-service` log, at DEBUG
  level (not shown by default; set `LOGGING_LEVEL_COM_TTTN_USERSERVICE=DEBUG` in
  `user-service/.env` to read it locally).
- **Rate limit is per gateway instance** (in memory), and inside Docker all guests share one
  IP bucket per route.
- **Money as JS numbers in payment-service.** The mock payment compares amounts as
  JavaScript floats (fine for VND totals, not exact decimal arithmetic).
- **Role editing is only partly guarded.** A `role:manage` holder can still add permissions to
  a role they hold through `PUT /api/roles/:id`; only role assignment and the `ADMIN` role are
  protected.
- **Models** — the face-shape model is weak on some classes and the ranker is trained on
  simulated data (see the notes above).
- **Webcam** (`getUserMedia`) only works on `localhost` / HTTPS.

---

## Code structure

Every backend service follows the same layered flow with **dependency injection**.
Dependencies point **inward** — outer layers depend on inner ones, never the reverse.

```
HTTP request / RabbitMQ message
   │
   ▼
 route / controller layer   parse & validate input (DTOs), map HTTP ↔ domain — no business logic
   ▼
 service layer              use-cases, orchestration, rules — depends on repository interfaces
   ▼
 repository layer           data access and every other outside adapter
   ▼                        (DB, RabbitMQ publishers / consumers, S3, HTTP clients)
 db layer                   entities / models, migrations
```

How each stack maps onto it:

- **NestJS** (`api-gateway`, `product-service`, `payment-service`) — flat folders under `src/`:
  `routes/` (controllers + `routes/dto/` class-validator DTOs) → `services/` →
  `repositories/` (interfaces bound through DI tokens) → `db/` (TypeORM entities, enums,
  migrations), plus `common/` (response envelope, exception filter) and `config/`. The gateway
  has no database: its `services/` are proxies to the downstream services, with `auth/` for the
  guards.
- **Spring Boot** (`user-service`, `order-service`) — `controller/` → `service/` (interface) +
  `service/impl/` → `repository/` (Spring Data JPA) → `entity/`, with `dto/request` /
  `dto/response`, `exception/`, `config/`, and Flyway migrations under
  `resources/db/migration`. `order-service` adds `client/` (REST client for product-service),
  `messaging/` (listeners, publishers, outbox relay) and `scheduling/` (reconciliation and
  cleanup jobs).
- **FastAPI** (`face-processing-service`, `recommendation-service`) — `app/routers` →
  `app/services` → `app/repositories` → `app/db`, with `app/schemas` (Pydantic DTOs),
  `app/core` (config, request id, internal auth) and **`app/ml`** (the feature and scoring code
  shared with the offline training in `ml/`). Model files live in `models/` at the service
  root. Dependencies are wired with FastAPI `Depends` providers.
- **Next.js** (`web`) — `src/app` (routes: `(shop)` and `(admin)` groups), `src/components`,
  `src/hooks` (data fetching with plain `fetch`, no state library), `src/lib/api` (the client
  layer; talks only to the gateway), `src/lib/vto` (try-on math), `src/lib/tracking`
  (behavior events).

**Principles applied**

- **SRP** — each layer has one reason to change; controllers don't query the DB.
- **DIP** — services depend on repository *interfaces*; implementations are injected (swap
  DB / mock freely).
- **Shared contracts** — HTTP and event contracts live in `infra/contracts`.

---

## Machine learning (offline)

`ml/` holds the training pipelines. Nothing in it runs in Docker Compose.

- **`ml/face-shape/`** — builds the dataset (download → de-duplicate → group by person →
  MediaPipe landmarks → features → person-aware train / val / test split), trains and compares
  SVM / Random Forest / XGBoost, calibrates and evaluates the best one.
- **`ml/recommendation/`** — a behavior **simulator** (personas, 90 days of events), the
  ranking dataset, training (Logistic Regression / Random Forest / XGBoost / XGBoost ranker)
  and the experiment that studies α / β for the hybrid score.

`make export` writes a model and its `model_card.json` straight into the service's `models/`
folder; the image is built with it, and the served version is chosen by
`FACE_SHAPE_MODEL_VERSION` / `PREFERENCE_MODEL_VERSION`. Training and serving import the
**same feature code** (`app/ml` of each service), and a service refuses to start when the
model's feature schema does not match. See `ml/README.md`.

---

## Running locally

> Prerequisite: Docker Desktop / Docker Engine.

```bash
# 1. Provide environment values (run from the repo root)
cp infra/.env.example infra/.env
for s in api-gateway user-service product-service order-service payment-service face-processing-service recommendation-service web; do cp $s/.env.example $s/.env; done

# 2. Bring the whole system up
cd infra
docker compose up --build

# 3. Seed the catalog (once, from infra/, while the stack is running)
docker compose exec product-service node dist/seed.js
```

> ⚠️ **Two secrets must match across the `.env` files, by hand:**
> - `JWT_SECRET` — the same Base64 value in `user-service` and `api-gateway` (replace the
>   `.env.example` placeholder; `user-service` does not start when it is blank).
> - `INTERNAL_API_KEY` — the same non-empty value in `api-gateway`, `user-service`,
>   `product-service`, `order-service`, `face-processing-service` and `recommendation-service`.
>   It is **empty** in several `.env.example` files, and an empty or mismatched key rejects
>   every internal call: reviews fail, the admin AI / analytics pages return 403, and
>   recommendations silently ignore the face analysis. Between `api-gateway` and
>   `user-service` a mismatch means plain logged-in routes keep working (token revocation is
>   not checked, an ERROR is logged), but every permission-guarded (admin) route fails with 403.

- Web app:       http://localhost:3000
- API gateway:   http://localhost:8080 (routes under `/api`)
- MinIO console: http://localhost:9001 (S3 API on 9000 — the browser loads images from it)
- RabbitMQ management UI: http://localhost:15672
- **Admin login** (seeded by `user-service`): username `admin`, password `Admin@123`.

The backend services are not published on the host; reach them through the gateway.

**Hot reload** — instead of step 2:
`docker compose -f docker-compose.yml -f docker-compose.watch.yml watch` (from `infra/`).

> 🗄️ **Databases and migrations are automatic.** On its first start, Postgres creates one
> database per service (`infra/scripts/init-multiple-dbs.sh`). Each service then migrates its
> own schema on every start: Flyway (`user-service`, `order-service`), TypeORM migrations from
> `entrypoint.sh` (`product-service`, `payment-service`) and Alembic from `entrypoint.sh`
> (`face-processing-service`, `recommendation-service`).
>
> **Seed data** is the one manual step (step 3). It loads `infra/seed/products.json` —
> 60 products, 8 brands, 5 categories, each product with a try-on PNG — and is safe to run
> again (existing SKUs are skipped). See `infra/README.md`.
>
> If a container fails to start with "port is already allocated", another local program is
> using that port (Postgres 5432, Redis 6379, MinIO 9000 / 9001, RabbitMQ 5672 / 15672). Add a
> gitignored `infra/docker-compose.override.yml` that remaps the `ports` to a free host port
> (Compose loads it automatically).

---

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. A path filter
runs only the jobs of the services that changed; each job installs, lints (Node services),
builds, tests and builds the Docker image (not pushed). `user-service` has no CI job.
