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
- Fetches products from `product-service` over REST (East-West, catalog cached
  `CATALOG_TTL_SECONDS`) and face analyses from `face-processing-service`'s internal API
  (`X-Internal-Key`; unreachable / no analysis → β = 0).
- Consumes `behavior-events` from RabbitMQ and stores them in the `interactions` table
  (idempotent by `eventId`). Contract: [`infra/contracts/behavior-events.md`](../infra/contracts/behavior-events.md).
- Internal read endpoints over the stored events (for other services, not the browser).

## Structure (router → service → repository → db, with DI / SOLID)
```
app/
  main.py         # FastAPI entrypoint, lifespan (starts the consumer), error envelope
  routers/        # recommend (+ /health), internal (/internal/*)
  services/       # hybrid ranking (pure) + recommendation use-cases; behavior event ingest
  repositories/   # product-service + face-processing clients; interactions / impressions repos; RabbitMQ consumer
  db/             # SQLAlchemy async engine/session + ORM models (interactions, impressions)
  schemas/        # Pydantic DTOs (incl. the behavior event payload)
  core/           # config, internal-key auth, face-shape→frame mapping config, model registry
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
`RABBITMQ_PASSWORD` there. `BEHAVIOR_CONSUMER_ENABLED=false` turns the consumer off
(used by tests).

**Your real `.env` also needs `PREFERENCE_MODEL_VERSION`** (e.g.
`v1-sim-20261110-xgbrank`). Without it the service runs in **legacy mode**: no model is
loaded, preference = popularity and α = 0 (the response reports `alpha: 0`). If the folder
is missing or its `feature_schema_version` differs from the code, the app does not start.
`FACE_PROCESSING_SERVICE_URL`, `RANK_ALPHA` / `RANK_BETA` (0.6 / 0.4),
`CATALOG_TTL_SECONDS`, `MAX_PER_FRAME_SHAPE` / `MAX_PER_BRAND` have defaults.

## Notes
- The catalog and the global product stats (replay of all interactions) are cached in
  process for `CATALOG_TTL_SECONDS` (Redis comes in plan 14), so new events change
  popularity after at most that long; a user's own history is read on every request.
- `POST /recommend` still works when `recommendation_db` is down (no personalization,
  ranked by FaceFit); `for-you` answers 503 then.
- Stored events are never deleted for now (small thesis dataset).
- `models/preference/<version>/` is written by `make export` in `ml/recommendation`
  (best model by val NDCG@10; calibration params live in `model_card.json`). The folder
  is baked into the image (`COPY . .`) — a new model version needs an image rebuild.
  `xgboost` is pinned to the card's `library_versions.xgboost` (3.2.0).
