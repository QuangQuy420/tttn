# reco

**Recommendation service** — Python + FastAPI. Content-based frame recommendations by face shape.

## Responsibilities
- `POST /recommend` — accepts `faceShape` (+ optional filters: gender, color, price) →
  returns a ranked list of products.
- Maps face shape → suitable frame shapes (config) and scores candidates.
- Fetches products from `catalog` over REST (East-West).

## Structure (router → service → repository → db, with DI / SOLID)
```
app/
  routers/        # FastAPI routers, request/response wiring
  services/       # mapping + scoring use-cases (content-based ranking)
  repositories/   # catalog client (read products) — interface + impl
  db/             # (optional) read-model / cache
  schemas/        # Pydantic DTOs
  core/           # config, DI, app bootstrap; face-shape→frame mapping config
tests/            # unit tests for scoring
```
> `app/main.py` (FastAPI entrypoint) is added with the implementation.

## Notes
- Collaborative filtering is a future enhancement (stretch), not in core scope.
- See [`.env.example`](.env.example) for the catalog URL.
