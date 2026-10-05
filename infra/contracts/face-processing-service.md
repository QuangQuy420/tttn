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
  "modelVersion": "fs-20261005-svm", // "rule-v0" when method = rule
  "quality": { "yaw": 3.2, "pitch": -5.1, "roll": 0.8 }  // degrees; only on POST /analyze, null in history
}
```

- `method = rule` (`FACE_SHAPE_CLASSIFIER=rule`): `probabilities` is one-hot of the rule label.
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
    "modelVersion": "fs-20261005-svm", // null for pre-plan-08 rows
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
