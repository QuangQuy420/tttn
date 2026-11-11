# recommendation-service

**Recommendation Service** — Python + FastAPI. Hybrid frame recommendations
(`finalScore = α·preferenceScore + β·faceFitScore`), plus a **behavior event store**: user
interactions (view, try-on, like, add-to-cart, purchase) arrive asynchronously over RabbitMQ
and are saved in its own Postgres database (`recommendation_db`); they feed the
personalized ranker (PreferenceScore).

## Responsibilities
- `POST /recommend` — accepts `faceShape` (+ optional filters: gender, price, page/limit)
  and an optional `X-User-Id` header → ranks the WHOLE catalog (not only products tagged
  with that face shape); personalized when `X-User-Id` is a valid UUID. Each item has
  `score` (= `finalScore`, 0–1), `preferenceScore`, `faceFitScore`, `finalScore`, `reasons[]`.
- `GET /recommendations/for-you?limit=10&faceAnalysisId=` — header `X-User-Id` required
  (400 otherwise): personal list from the user's behavior + their latest (or chosen) face
  analysis; purchased products are left out; top-10 has at most 3 per frame shape and 3 per
  brand; one row is logged to `recommendation_impressions`.
- PreferenceScore: XGBoost ranker from `models/preference/<PREFERENCE_MODEL_VERSION>/`
  (cold-start users → normalized popularity). FaceFitScore: face-shape probabilities ×
  the face-shape → frame-shape table (`app/core/face_shape_mapping.py` ÷ 10).
- Fetches products from `product-service` over REST (East-West; the catalog is cached in
  Redis, see below) and face analyses from `face-processing-service`'s internal API
  (`X-Internal-Key`; unreachable / no analysis → β = 0). Both calls forward `X-Request-Id`.
- Consumes `behavior-events` from RabbitMQ and stores them in the `interactions` table
  (idempotent by `eventId`). Contract: [`infra/contracts/behavior-events.md`](../infra/contracts/behavior-events.md).
- Consumes `product-events` (`product.updated` / `product.deleted`) to clear the catalog cache.
  Contract: [`infra/contracts/product-events.md`](../infra/contracts/product-events.md).
- Internal read endpoints over the stored events (for other services, not the browser).
- `GET /health` (liveness, used by Docker) and `GET /health/ready` (readiness: DB, Redis,
  RabbitMQ — see below).

## Structure (router → service → repository → db, with DI / SOLID)
```
app/
  main.py         # FastAPI entrypoint, logging + request-id middleware, lifespan (starts both consumers), error envelope
  routers/        # recommend (+ /health, /health/ready), internal (/internal/*)
  services/       # hybrid ranking (pure) + recommendation use-cases; behavior event ingest
  repositories/   # product-service + face-processing clients; Redis catalog cache; interactions / impressions repos; RabbitMQ consumers
  db/             # SQLAlchemy async engine/session + ORM models (interactions, impressions)
  schemas/        # Pydantic DTOs (incl. the behavior event payload)
  core/           # config, internal-key auth, face-shape→frame mapping config, model registry, request id + logging
  ml/             # features.py — pure ranker features (numpy only), shared with ml/recommendation
                  # preference.py — raw model score → calibrated PreferenceScore (numpy only), shared too
                  # face_fit.py — face-shape probabilities → FaceFitScore (pure)
models/
  preference/<version>/  # exported PreferenceScore model: model.joblib or model.json + model_card.json
alembic/          # migrations — run by entrypoint.sh (`alembic upgrade head`) on start
tests/            # unit tests
```

## Database
- Own database `recommendation_db` (database-per-service), table `interactions`
  (`event_id` UNIQUE, `user_id`, `product_id`, `event_type`, `occurred_at`, `source`,
  `context` JSONB, `received_at`) and table `recommendation_impressions` (one row per
  `for-you` answer: `user_id`, `created_at`, `product_ids` uuid[], `scores` JSONB
  `{productId: {preference, faceFit, final}}`, `alpha`, `beta`, `model_version`,
  `face_analysis_id`).
- The container runs `alembic upgrade head` before starting uvicorn (`entrypoint.sh`).
- New migration after a model change: `alembic revision --autogenerate -m "<desc>"`
  (with `DATABASE_URL` pointing at a running Postgres), then review it.
- **Existing `pgdata` volume:** the Postgres init script only creates databases on the
  very first boot. If your volume is older than this service's DB, create it once:
  ```
  docker compose exec postgres createdb -U app recommendation_db
  ```

## Behavior events consumer
- Declared on startup: topic exchange `behavior-events`, quorum queue
  `recommendation-service.behavior-events` bound with `behavior.*`, dead-letter exchange
  `behavior-events.dlx` (fanout) → queue `behavior-events.dlq`.
- Valid event → stored, ack. Same `eventId` again → not stored again, ack.
  Bad JSON / missing or invalid field → rejected to `behavior-events.dlq`.
  Other errors (e.g. DB down) → requeued after 2 s; after `BEHAVIOR_QUEUE_DELIVERY_LIMIT`
  deliveries the message is dead-lettered.
- Runs in the background: startup and `/health` never wait for RabbitMQ. It keeps
  retrying the first connect every 3 s and reconnects by itself after a broker restart.
- Don't change the queue arguments after the queue exists (RabbitMQ refuses the
  re-declare with `PRECONDITION_FAILED`) — delete the queue in the RabbitMQ UI first.

### Manual test (RabbitMQ UI, http://localhost:15672)
Exchanges → `behavior-events` → *Publish message*, routing key `behavior.view`, payload:
```json
{
  "eventId": "3f1c2a8e-8a55-4f7e-9d7a-1b2c3d4e5f60",
  "eventType": "VIEW",
  "userId": "0b8f5a3e-2c1d-4e6f-8a9b-0c1d2e3f4a5b",
  "productId": "7d6c5b4a-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
  "occurredAt": "2026-09-29T10:00:00Z",
  "source": "web",
  "context": { "sessionId": "abc", "durationMs": 1200 }
}
```
Then check `SELECT * FROM interactions;` in `recommendation_db`. Publishing the same
message again must not add a row; a message without `userId` must land in
`behavior-events.dlq`.

## Product events consumer (catalog cache)
- Declared on startup: topic exchange `product-events`, quorum queue
  `product-events.recommendation-service` bound with `product.updated` and `product.deleted`,
  dead-letter exchange `product-events.dlx` (fanout) → queue `product-events.dlq` (shared with
  `order-service`, same settings).
- Valid event (JSON with `productId`) → delete the Redis key `rec:catalog:v1`, ack. The next
  recommendation reloads the catalog from `product-service`. A failed Redis delete is logged and
  the message is still acked (the TTL limits how long the old catalog stays).
  Bad JSON / no `productId` → rejected to `product-events.dlq`.
- Same background start / reconnect behavior as the behavior consumer.
  `PRODUCT_CONSUMER_ENABLED=false` turns it off.
- `product-service` publishes no `product.created`, so a **new product** shows up after the
  cache expires (≤ `CATALOG_TTL_SECONDS`, 300 s). See
  [ADR 0005](../infra/docs/adr/0005-redis-cache-and-event-invalidation.md).

### Manual test (catalog cache)
Call a recommendation twice (the second call does not read `product-service`), change a
product's price in the admin, then check that the key is gone
(`docker compose exec redis redis-cli EXISTS rec:catalog:v1` → `0`) and the next
recommendation shows the new price.

## Readiness check
`GET /health/ready` (not wrapped in the envelope, not routed through the gateway):
- **200** `{"status": "ok", "checks": {"db": "ok", "redis": "ok", "broker": "ok"}}`
- **503** `{"status": "unavailable", "checks": {...}}` — the failing checks are `"error"`.

`db` = `SELECT 1`, `redis` = `PING`, `broker` = every enabled consumer is connected
(`"disabled"` when both consumers are off). Each check times out after 2 s. Docker's
healthcheck still uses `GET /health`.

## Logs and request id
Log lines look like `2026-11-11 10:00:00,123 INFO app.access [<requestId>] POST /recommend 200 35.2ms`
(the access-line path is percent-encoded; `httpx` logs only warnings).
The id comes from the `X-Request-Id` header (set by the gateway; a missing or invalid value is
replaced by a new UUID), is returned on the response and forwarded to `product-service` and
`face-processing-service`. `[-]` = outside a request (startup, RabbitMQ consumers). Contract:
[`infra/contracts/README.md`](../infra/contracts/README.md).

## Internal endpoints
Both require header `X-Internal-Key: <INTERNAL_API_KEY>` (missing/wrong → 403) and
return the usual `{success, message, data}` envelope.
- `GET /internal/users/{userId}/interactions?since=&limit=` — a user's events, newest
  first. `since` must carry a timezone (`Z`, or `%2B07:00` URL-encoded); `limit` 1–1000,
  default 200.
- `GET /internal/stats/events?days=7` — event counts per UTC day and event type over the
  last `days` UTC days including today (`days` 1–90).

## Configuration
See [`.env.example`](.env.example). **Update your local `.env` from `.env.example`** —
`DATABASE_URL`, `RABBITMQ_URL` and `INTERNAL_API_KEY` are required; the container fails
on startup without them. `INTERNAL_API_KEY` must be the same value as in `infra/.env`,
and the RabbitMQ credentials in `RABBITMQ_URL` must match `RABBITMQ_USER` /
`RABBITMQ_PASSWORD` there. `BEHAVIOR_CONSUMER_ENABLED=false` / `PRODUCT_CONSUMER_ENABLED=false`
turn the consumers off (used by tests). The product-events consumer reuses `BEHAVIOR_PREFETCH`
and `BEHAVIOR_QUEUE_DELIVERY_LIMIT`. `REDIS_URL` (default `redis://redis:6379/0`) is the
catalog cache; if Redis is unreachable the cache is skipped and every request reads
`product-service`.

**Your real `.env` also needs `PREFERENCE_MODEL_VERSION`** (e.g.
`v1-sim-20261110-xgbrank`). Without it the service runs in **legacy mode**: no model is
loaded, preference = popularity and α = 0 (the response reports `alpha: 0`). If the folder
is missing or its `feature_schema_version` differs from the code, the app does not start.
`FACE_PROCESSING_SERVICE_URL`, `RANK_ALPHA` / `RANK_BETA` (0.6 / 0.4),
`PREFERENCE_NORM` (`rank` = preference ranked over the candidates, in [0, 1]; `none` = calibrated
score as is — the defaults are a product choice, see
[`ml/recommendation/reports/hybrid/SUMMARY.md`](../ml/recommendation/reports/hybrid/SUMMARY.md)),
`CATALOG_TTL_SECONDS` (300 — Redis catalog cache and in-process product stats),
`MAX_PER_FRAME_SHAPE` / `MAX_PER_BRAND` have defaults.

## Notes
- The catalog is cached in Redis (`rec:catalog:v1`, `CATALOG_TTL_SECONDS`) and cleared by
  `product-events`; concurrent misses load it once (per process), and any cache miss within
  2 s (`RECENT_CATALOG_FETCH_REUSE_SECONDS`) of this process's last catalog fetch reuses that
  fetch (up to 2 s extra staleness after an invalidation). The global product stats (replay of all
  interactions) stay cached in process for `CATALOG_TTL_SECONDS`, so new events change
  popularity after at most that long; a user's own history is read on every request.
- `POST /recommend` still works when `recommendation_db` is down (no personalization,
  ranked by FaceFit); `for-you` answers 503 then.
- Stored events are never deleted for now (small thesis dataset).
- `models/preference/<version>/` is written by `make export` in `ml/recommendation`
  (best model by val NDCG@10; calibration params live in `model_card.json`). The folder
  is baked into the image (`COPY . .`) — a new model version needs an image rebuild.
  `xgboost` is pinned to the card's `library_versions.xgboost` (3.2.0).
