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

## Downstream calls

| Callee | Call | Used for |
|---|---|---|
| product-service | `GET /products?page=n&limit=100` (all pages, cached `CATALOG_TTL_SECONDS = 300`) | candidate catalog |
| face-processing-service | `GET /internal/users/{userId}/latest-analysis`, `GET /internal/analyses/{analysisId}?userId=` (`X-Internal-Key`) — see `face-processing-service.md` | face-shape probabilities |
| `recommendation_db` | `interactions` (read), `recommendation_impressions` (write) | behavior history, popularity, impression log |
