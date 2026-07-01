# recommendation-service

**Recommendation Service** — Python + FastAPI. Face shape-based frame recommendations
(no collaborative/content-based filtering on user behavior — purely face-shape driven).

## Responsibilities
- `POST /recommend` — accepts `faceShape` (+ optional filters: gender, color, price) →
  returns a ranked list of products.
- Maps face shape → suitable frame shapes (config) and scores candidates.
- Fetches products from `product-service` over REST (East-West).

## Structure (router → service → repository → db, with DI / SOLID)
```
app/
  routers/        # FastAPI routers, request/response wiring
  services/       # mapping + scoring use-cases (face-shape based ranking)
  repositories/   # product-service client (read products) — interface + impl
  db/             # (optional) read-model / cache
  schemas/        # Pydantic DTOs
  core/           # config, DI, app bootstrap; face-shape→frame mapping config
tests/            # unit tests for scoring
```
> `app/main.py` (FastAPI entrypoint) is added with the implementation.

## Notes
- Collaborative/content-based filtering is out of scope by design — see the thesis's
  recommender-system rationale.
- See [`.env.example`](.env.example) for the product-service URL.
