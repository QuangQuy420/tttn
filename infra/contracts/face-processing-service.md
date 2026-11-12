# face-processing-service — HTTP Contract

Face-shape analysis of a user photo. Public routes go through `api-gateway`
(`/api/face-analysis/*`); `/internal/*` routes are only reachable on the Docker network (the
service has no published port and the gateway does not route them). Every body uses the shared
response envelope (see `README.md`). Added in `.planning/2026-09-29-08-face-shape-model-serving.md`
(plan 08).

## `AnalyzeResponse` (`POST /analyze`, each item of `GET /analyses`)

```jsonc
{
  "id": "uuid",
  "faceShape": "ROUND|SQUARE|OVAL|HEART|DIAMOND|OBLONG",
  "measurements": {                    // pixel distances / image width (≈ 0–1.5), ratios unit-free
    "face_length": 0.41, "forehead_width": 0.30, "cheekbone_width": 0.36, "jaw_width": 0.31,
    "length_to_width_ratio": 1.14, "cheekbone_to_jaw_ratio": 0.86, "forehead_to_jaw_ratio": 0.97
  },
  "confidence": 0.57,                  // ML: max probability; rule: old heuristic score
  "imageUrl": "presigned GET url",
  // added in plan 08 (null on rows created before it)
  "probabilities": { "DIAMOND": 0.03, "HEART": 0.03, "OBLONG": 0.09,
                     "OVAL": 0.01, "ROUND": 0.27, "SQUARE": 0.57 },  // all 6 shapes, sum ≈ 1
  "method": "ml|rule",
  "modelVersion": "v2-full-real-20261005-svm", // "rule-v0" when method = rule
  "quality": { "yaw": 3.2, "pitch": -5.1, "roll": 0.8 }  // degrees; only on POST /analyze, null in history
}
```

- `method = rule` (`FACE_SHAPE_CLASSIFIER=rule`): `probabilities` is one-hot of the rule label.
- Files over 10 MB → 400 `BAD_REQUEST`, message `"Ảnh quá lớn — dung lượng tối đa cho phép là 10MB."`
  (the gateway already stops bodies over 10 MB with 413 `PAYLOAD_TOO_LARGE`).
- Images with more than `FACE_MAX_PIXELS` pixels (width × height, default 25 000 000, read from
  the image header before decoding) → 400 `BAD_REQUEST`, message
  `"Ảnh quá lớn — kích thước tối đa cho phép là 25 triệu điểm ảnh."`
- Image storage (MinIO / S3) unreachable or timing out → 503 `SERVICE_UNAVAILABLE`, message
  `"Không thể lưu ảnh lúc này — vui lòng thử lại sau."` Stored object keys are `<uuid><ext>`
  (the uploaded file name is not used).
- Photos with `|yaw| > FACE_MAX_YAW_DEG` (default 25°) → 400 `BAD_REQUEST`, message
  `"Khuôn mặt đang quay nghiêng quá nhiều — vui lòng nhìn thẳng vào camera và chụp lại."`
- Faces with cheekbone width < `FACE_MIN_CHEEK_PX` pixels (default 80, same as the training
  data filter) → 400 `BAD_REQUEST`, message `"Khuôn mặt quá nhỏ trong ảnh — vui lòng chụp gần hơn."`
- Degenerate landmarks / head pose → 400 `BAD_REQUEST`, message
  `"Không thể phân tích khuôn mặt trong ảnh — vui lòng chụp lại rõ mặt, nhìn thẳng."`

## `GET /internal/users/{userId}/latest-analysis`

Newest analysis of one user. Consumer: `recommendation-service` (plan 11, FaceFitScore).

| | |
|---|---|
| Header | `X-Internal-Key: <INTERNAL_API_KEY>` (same value in both services' `.env`) |
| Path | `userId` — uuid (invalid → 400 `VALIDATION_FAILED`) |

**200**

```jsonc
{ "success": true, "message": "Thành công",
  "data": {
    "analysisId": "uuid",
    "userId": "uuid",
    "faceShape": "SQUARE",
    "probabilities": { "DIAMOND": 0.03, "HEART": 0.03, "OBLONG": 0.09,
                       "OVAL": 0.01, "ROUND": 0.27, "SQUARE": 0.57 },  // null for pre-plan-08 rows
    "method": "ml",                 // null for pre-plan-08 rows
    "modelVersion": "v2-full-real-20261005-svm", // null for pre-plan-08 rows
    "createdAt": "2026-09-30T10:00:00Z"
  } }
```

**403** — header missing, wrong, or `INTERNAL_API_KEY` empty in the service:

```json
{ "success": false, "message": "Không có quyền truy cập nội bộ",
  "error": { "code": "FORBIDDEN", "details": null } }
```

**404** — the user has no analysis yet:

```json
{ "success": false, "message": "Người dùng chưa có kết quả phân tích khuôn mặt.",
  "error": { "code": "NOT_FOUND", "details": null } }
```

## `GET /internal/analyses/{analysisId}?userId=<uuid>`

One specific analysis of one user. Consumer: `recommendation-service`
(`GET /recommendations/for-you?faceAnalysisId=`, FaceFitScore). Added in
`.planning/2026-09-29-11-hybrid-recommendation-serving.md` (plan 11).

| | |
|---|---|
| Header | `X-Internal-Key: <INTERNAL_API_KEY>` (same as `latest-analysis`) |
| Path | `analysisId` — uuid (invalid → 400 `VALIDATION_FAILED`) |
| Query | `userId` — uuid, required: the user who must own the analysis (missing / invalid → 400 `VALIDATION_FAILED`) |

**200** — same `data` shape as `latest-analysis` above (`analysisId`, `userId`, `faceShape`,
`probabilities|null`, `method|null`, `modelVersion|null`, `createdAt`).

**403** — same as `latest-analysis`.

**404** `NOT_FOUND` — no analysis with this id, **or** it belongs to another user (the two cases
are not told apart, so a caller cannot probe other users' analyses).
`recommendation-service` treats a 404 as "no analysis" (β = 0).

## Admin endpoints (`/admin/*`)

Read-only admin views (`.planning/2026-09-29-15-admin-ai-analytics.md`, plan 15). Gateway:
`/api/admin/ai/face-shape-model`, `/api/admin/analytics/face-shapes` (JWT + `order:manage`,
see `api-gateway/README.md`). Header `X-Internal-Key` on every route — **403** same as
`latest-analysis`.

### `GET /admin/model-info`

The served classifier (`FACE_SHAPE_CLASSIFIER`), from the `model_card.json` loaded at boot:

```jsonc
{ "method": "ml",                                  // "ml" | "rule"
  "modelVersion": "v2-full-real-20261005-svm",     // "rule-v0" when method = rule
  "algorithm": "SVM (RBF)",
  "classes": ["DIAMOND", "HEART", "OBLONG", "OVAL", "ROUND", "SQUARE"],
  "metrics": { "accuracy": 0.5407,                 // card metrics.test_accuracy (full float, rounded here)
               "macroF1": 0.4851,                  // card metrics.test_macro_f1
               "perClass": { "OVAL": { "precision": 0.3235, "recall": 0.3259, "f1": 0.3247, "support": 135 } /* … all classes */ } },
  "createdAt": "2026-10-05T04:01:08+00:00" }       // card created_at
```

`method = "rule"` → every field except `method` / `modelVersion` is `null`. A key missing from
the card → `null`.

### `GET /admin/analytics/face-shapes?from=&to=`

Number of analyses (`face_analyses.created_at`) per face shape.

| | |
|---|---|
| Query `from`, `to` | `YYYY-MM-DD`, both inclusive, calendar days in **`Asia/Ho_Chi_Minh`**. Default `to` = today there, `from` = `to` − 29 days. Malformed → 400 `VALIDATION_FAILED` |

```jsonc
{ "from": "2026-10-13", "to": "2026-11-11", "total": 52,
  "items": [ { "faceShape": "OVAL", "count": 20 } /* … */ ] }
```

- Always 6 `items`, in `FaceShape` enum order (`ROUND`, `SQUARE`, `OVAL`, `HEART`, `DIAMOND`,
  `OBLONG`), zero-filled; `total` = sum of the counts.
- No `source` filter.
- **400** `BAD_REQUEST` — `from > to` → `"Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"`;
  range longer than 90 days → `"Khoảng thời gian tối đa là 90 ngày"`; an extreme date whose
  window cannot be computed (e.g. `to=9999-12-31`, `from=0001-01-01`) → `"Khoảng thời gian không hợp lệ"`.
