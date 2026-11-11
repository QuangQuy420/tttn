# recommendation-service — HTTP Contract

Product recommendations for a face shape and/or a user. Reached through `api-gateway`
(`/api/recommendations*`); the service has no published port. Every body uses the shared
response envelope (see `README.md`). Hybrid ranking added in
`.planning/2026-09-29-11-hybrid-recommendation-serving.md` (plan 11).

## Ranking

```
finalScore = α · preferenceScore + β · faceFitScore        (all three in [0, 1])
```

- `preferenceScore` — personal preference from the XGBoost ranker (plan 10), on the
  `PREFERENCE_NORM` scale (plan 12):
  - `rank` (default) — the rank of the model score among the scored candidates, scaled to
    [0, 1] (top = 1.0, ties share the average rank). Relative to the candidate list, NOT a
    calibrated probability.
  - `none` — the calibrated model score in (0, 1) as is (median ≈ 0.01).
  User with no behavior yet (cold start) or legacy mode → rank-normalized product popularity
  instead, in both modes (unchanged).
- `faceFitScore` — `Σ_s p(s) · M[s][frameShape]`: the face-shape probabilities `p(s)` of the
  user's analysis (one-hot of `faceShape` when the analysis has no `probabilities`) times the
  face-shape → frame-shape table (`face_shape_mapping.py`, 0–10 ÷ 10).
- `α` / `β` come from `RANK_ALPHA` / `RANK_BETA` (default `0.6` / `0.4`) and the scale from
  `PREFERENCE_NORM` (default `rank`) in `recommendation-service/.env`. These defaults are a
  product choice, not the experiment's val-selected config (`none`, 0.995 / 0.005) — see
  `ml/recommendation/reports/hybrid/SUMMARY.md`. Effective values:
  - `β = 0` when the user has no face analysis (or face-processing-service is down / times out).
  - `α = 0` when `PREFERENCE_MODEL_VERSION` is empty (legacy mode: no model loaded).
- Ties in `finalScore` are broken by popularity (descending).

## `RecommendedProductDto` (each item of `POST /recommend` and `for-you`)

Existing fields are unchanged; plan 11 only **adds** fields.

```jsonc
{
  "id": "uuid", "sku": "…", "name": "…", "slug": "…",
  "frameShape": "ROUND|SQUARE|OVAL|CAT_EYE|AVIATOR|RECTANGLE|WAYFARER|RIMLESS",
  "basePrice": 1200000,
  "brand": { "id": "uuid", "name": "…", "logoUrl": "…|null" },
  "images": [ { "id": "uuid", "variantId": "uuid|null", "imageUrl": "…",
                "isThumbnail": true, "sortOrder": 0, "kind": "GALLERY" } ],
  "faceShapes": ["OVAL"],
  "score": 0.71,              // = finalScore. CHANGED SCALE in plan 11: 0–1 (was 0–10)
  // added in plan 11
  "preferenceScore": 0.64,    // [0, 1]
  "faceFitScore": 0.82,       // [0, 1]
  "finalScore": 0.71,         // α·preferenceScore + β·faceFitScore
  "reasons": ["Hợp dáng mặt Oval", "Giống kiểu gọng bạn hay xem"]  // Vietnamese, at most 2
}
```

`reasons` values (in priority order, at most 2 per item): `"Hợp dáng mặt {X}"`,
`"Giống kiểu gọng bạn hay xem"`, `"Thương hiệu bạn yêu thích"`, `"Trong khoảng giá bạn quan tâm"`,
`"Được nhiều người mua"`. May be empty.

## `POST /recommend`

Gateway: `POST /api/recommendations` — **optional** JWT (`OptionalJwtGuard`). With a valid token
the gateway forwards `X-User-Id`; without a token (or with an invalid one) the call stays anonymous.

| | |
|---|---|
| Header | `X-User-Id: <uuid>` — optional. Present and valid → personalized `preferenceScore`; invalid uuid → treated as anonymous |
| Body | `{ faceShape, genderTarget?, minPrice?, maxPrice?, page = 1, limit = 20 (1..100) }` (unchanged) |

- All products of the catalog are scored, also those not tagged with `faceShape` (before plan
  11 only tagged products were returned). `faceShape` is used one-hot for `faceFitScore`
  (β always applies here).
- No purchase exclusion, no diversity cap, no impression log.
- Response unchanged in shape: list envelope with `meta` (`page`, `limit`, `total`,
  `totalPages`), `data` = `RecommendedProductDto[]` sorted by `finalScore`.
- **503** `SERVICE_UNAVAILABLE` / **504** `GATEWAY_TIMEOUT` — product-service unavailable / timed
  out (unchanged). If the recommendation DB is down, the call still answers, ranked by
  `faceFitScore` only (no popularity, no personalization).

## `GET /recommendations/for-you`

Personal list for a logged-in user ("Dành cho bạn"). Gateway: `GET /api/recommendations/for-you`
— **JWT required** (`JwtGuard`); no / invalid token → **401** `UNAUTHORIZED` from the gateway. The
gateway forwards the query string and sets `X-User-Id` from the token.

| | |
|---|---|
| Header | `X-User-Id: <uuid>` — required (missing / not a uuid → 400 `BAD_REQUEST`) |
| Query | `limit` — integer 1..50, default 10 (invalid → 400 `VALIDATION_FAILED`) |
| Query | `faceAnalysisId` — uuid, optional (not a uuid → 400 `VALIDATION_FAILED`). Default: the user's latest analysis. An id that does not exist or belongs to another user → treated as "no analysis" (β = 0), not an error |

- Products the user has purchased are excluded.
- Diversity: in the first 10 items, at most `MAX_PER_FRAME_SHAPE = 3` with the same frame shape
  and at most `MAX_PER_BRAND = 3` from the same brand; items skipped by the caps fill the list
  when needed, so it still has `limit` items when the catalog is large enough.
- Each call writes one row to `recommendation_db.recommendation_impressions` (user, product ids,
  scores, α, β, model version, face analysis id). A failed write is logged, never returned.
  `scores.preference` is the value returned as `preferenceScore` (normalized per `PREFERENCE_NORM`).

**200** — single-object envelope (no `meta`):

```jsonc
{ "success": true, "message": "Thành công",
  "data": {
    "items": [ /* RecommendedProductDto, sorted after the diversity re-rank */ ],
    "faceShape": "OVAL",                    // face shape of the analysis used; null when none
    "faceAnalysisId": "uuid",               // analysis used; null when none
    "modelVersion": "v1-sim-20261110-xgbrank", // null in legacy mode
    "alpha": 0.6,                           // effective α (0 in legacy mode)
    "beta": 0.4                             // effective β (0 without an analysis)
  } }
```

**400** — `X-User-Id` missing / invalid (`BAD_REQUEST`), or a bad `limit` / `faceAnalysisId`
(`VALIDATION_FAILED`).

**503** `SERVICE_UNAVAILABLE` — product-service unavailable, or the recommendation DB is down.

**504** `GATEWAY_TIMEOUT` — product-service timed out.

## Admin endpoints (`/admin/*`)

Read-only admin views (`.planning/2026-09-29-15-admin-ai-analytics.md`, plan 15). Gateway:
`/api/admin/ai/preference-model` and `/api/admin/analytics/{events/daily,funnel,top-products}`
(JWT + `order:manage`, see `api-gateway/README.md`).

| | |
|---|---|
| Header | `X-Internal-Key: <INTERNAL_API_KEY>` — every route; missing / wrong / empty in the service → **403** `FORBIDDEN` `"Không có quyền truy cập nội bộ"` |
| Query `from`, `to` | `YYYY-MM-DD`, both inclusive, calendar days in **`Asia/Ho_Chi_Minh`**. Default `to` = today there, `from` = `to` − 29 days (30 days). Rows match `start of from ≤ occurred_at < start of (to + 1 day)` in that zone |
| Query `source` | `real` (default: every source except `simulator`) \| `simulator` \| `all` |

- Analytics cover only the 5 funnel types `VIEW`, `TRY_ON`, `LIKE`, `ADD_TO_CART`, `PURCHASE`
  (`UNLIKE` is left out).
- **400** `BAD_REQUEST` — `from > to` → `"Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"`;
  range longer than 90 days → `"Khoảng thời gian tối đa là 90 ngày"`; an extreme date whose
  window cannot be computed (e.g. `to=9999-12-31`, `from=0001-01-01`) →
  `"Khoảng thời gian không hợp lệ"`.
- **400** `VALIDATION_FAILED` — malformed date, unknown `source` / `eventType` (`UNLIKE`
  included), `limit` out of range.
- Day buckets here are Vietnam days; `GET /internal/stats/events` stays on **UTC** days, so its
  per-day numbers can differ.

### `GET /admin/model-info`

```jsonc
{ "loaded": true,                      // false in legacy mode (PREFERENCE_MODEL_VERSION empty)
  "version": "v1-sim-20261110-xgbrank", "algorithm": "XGBoost ranker", "objective": "rank:ndcg",
  "createdAt": "2026-11-10T10:10:37+00:00", // model card `created_at`
  "metrics": { "ndcgAt10": 0.2354, "hitRateAt10": 0.4462,   // model card metrics.test[*].mean (full float, rounded here)
               "precisionAt10": 0.0446, "recallAt10": 0.4462 },
  "alpha": 0.6, "beta": 0.4, "preferenceNorm": "rank" }  // configured RANK_ALPHA / RANK_BETA / PREFERENCE_NORM
```

`loaded = false` → `version`, `algorithm`, `objective`, `createdAt`, `metrics` are `null`;
`alpha`, `beta`, `preferenceNorm` are always set. A key missing from the card → `null`.

### `GET /admin/analytics/events/daily?from=&to=&source=`

```jsonc
{ "from": "2026-10-13", "to": "2026-11-11", "source": "real",
  "days": [ { "date": "2026-10-13",
              "counts": { "VIEW": 120, "TRY_ON": 30, "LIKE": 12, "ADD_TO_CART": 8, "PURCHASE": 2 } } ] }
```

One entry per day of the range, ascending; every day has all 5 keys (0 when no event).

### `GET /admin/analytics/funnel?from=&to=&source=`

```jsonc
{ "from": "…", "to": "…", "source": "real",
  "steps": [ { "eventType": "VIEW", "users": 400, "conversionFromPrevious": null },
             { "eventType": "TRY_ON", "users": 120, "conversionFromPrevious": 0.3 } /* … LIKE, ADD_TO_CART, PURCHASE */ ] }
```

- `users` = distinct users with at least one event of that type in the range. Steps are
  independent: a user does not need the earlier steps to be counted.
- `conversionFromPrevious` = `users / users of the previous step` (can be > 1); `null` for the
  first step and when the previous step has 0 users.

### `GET /admin/analytics/top-products?from=&to=&source=&eventType=VIEW&limit=10`

`eventType` — one of the 5 funnel types (default `VIEW`); `limit` — integer 1..50 (default 10).

```jsonc
{ "from": "…", "to": "…", "source": "real", "eventType": "VIEW",
  "items": [ { "productId": "uuid", "count": 57,
               "name": "…", "slug": "…", "thumbnailUrl": "…" } ] }
```

- Sorted by `count` desc, then `productId` asc.
- `name`, `slug`, `thumbnailUrl` come from the cached published catalog (product-service);
  `thumbnailUrl` = the `isThumbnail` image, else the first image, else `null`. A product not in
  the catalog (unpublished / deleted), or a catalog read that fails in any way or takes longer
  than `ADMIN_CATALOG_TIMEOUT_SECONDS` (2 s) → these three are `null` (warning logged, still
  **200**).

## Downstream calls

| Callee | Call | Used for |
|---|---|---|
| product-service | `GET /products?page=n&limit=100` (all pages; cached in Redis, see below) | candidate catalog; admin top-products names |
| face-processing-service | `GET /internal/users/{userId}/latest-analysis`, `GET /internal/analyses/{analysisId}?userId=` (`X-Internal-Key`) — see `face-processing-service.md` | face-shape probabilities |
| `recommendation_db` | `interactions` (read), `recommendation_impressions` (write) | behavior history, popularity, impression log |

Every outgoing call carries the incoming `X-Request-Id` (see `README.md`).

## Inputs (RabbitMQ)

| Exchange | Queue | Used for |
|---|---|---|
| `behavior-events` | `recommendation-service.behavior-events` | store user behavior in `interactions` — see `behavior-events.md` |
| `product-events` | `product-events.recommendation-service` (`product.updated`, `product.deleted`) | invalidate the catalog cache — see `product-events.md` |

## Catalog cache

- The whole catalog is cached in Redis under one key `rec:catalog:v1` (JSON) for
  `CATALOG_TTL_SECONDS` (default 300). Concurrent misses load it from product-service once (per process), and any cache miss within
  2 s (`RECENT_CATALOG_FETCH_REUSE_SECONDS`) of this process's last catalog fetch reuses that
  fetch — up to 2 s of extra staleness right after an invalidation.
- `product.updated` / `product.deleted` delete the key, so a price change or delete shows up in
  the next recommendation (normally within seconds). A new product has no event and appears after
  the TTL at the latest (≤ 300 s). Details and the consistency window:
  `infra/docs/adr/0005-redis-cache-and-event-invalidation.md`.
- Redis down → no error: recommendations read the catalog from product-service, at most once
  per 2 s per process.
- The global product stats (popularity) stay cached in process for `CATALOG_TTL_SECONDS`.

## `GET /health/ready`

Readiness check (not routed through the gateway; `GET /health` stays the liveness check used by
Docker). **Not wrapped** in the response envelope. Each check is bounded to 2 s.

**200**

```json
{ "status": "ok", "checks": { "db": "ok", "redis": "ok", "broker": "ok" } }
```

**503** — at least one check failed; failing checks are `"error"`:

```json
{ "status": "unavailable", "checks": { "db": "ok", "redis": "error", "broker": "ok" } }
```

- `db` — `SELECT 1` on `recommendation_db`.
- `redis` — `PING` on the catalog cache's Redis.
- `broker` — every enabled RabbitMQ consumer (behavior events, product events) is connected.
  `"disabled"` (not a failure) when both consumers are turned off
  (`BEHAVIOR_CONSUMER_ENABLED=false`, `PRODUCT_CONSUMER_ENABLED=false`).
