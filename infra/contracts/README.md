# Shared API Contracts

Contracts shared across services. Each producing service publishes its contract here; consumers
take a **versioned copy** (see `infra/docs/adr/0001-contract-sharing-mechanism.md` and
`infra/scripts/sync-contracts.sh`).

```
contracts/
  product-service.openapi.yaml   # product-service REST API (OpenAPI 3)
  order-checkout-saga.md         # order-saga-events exchange (checkout saga, RabbitMQ)
  product-events.md              # product-events exchange (catalog changes → cart sync + recommendation catalog cache, RabbitMQ)
  behavior-events.md             # behavior-events exchange (user behavior → recommendation-service, RabbitMQ)
  face-processing-service.md     # face-processing-service REST (AnalyzeResponse fields + internal latest-analysis / analysis by id + /admin/*)
  recommendation-service.md      # recommendation-service REST (POST /recommend score fields + GET /recommendations/for-you + /admin/* + GET /health/ready)
```

Other services do not publish an OpenAPI file here yet.

## Response envelope (all HTTP services)

Every backend service (`product-service`, `order-service`, `user-service`, `payment-service`,
`face-processing-service`, `recommendation-service`) returns this JSON shape. Each service builds
the envelope itself; `api-gateway` passes it through and only builds the error envelope for
errors it creates itself (401, 403, 503, 504, ...).

```jsonc
// success (single object)
{ "success": true, "message": "Thành công", "data": <T> }

// success (list)
{ "success": true, "message": "Thành công", "data": [<T>],
  "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } }

// error
{ "success": false, "message": "<Vietnamese text>",
  "error": { "code": "<UPPER_SNAKE>", "details": <object|array|null> } }
```

- `message` is Vietnamese text for the user. Some endpoints use their own success message.
- `meta` is present only on list responses. For lists, `data` is always an array.
- Generic `error.code` by status, when a service has no more specific code:

  | Status | `error.code` |
  |---|---|
  | 400 | `BAD_REQUEST` (`VALIDATION_FAILED` for input validation; field errors in `details`) |
  | 401 | `UNAUTHORIZED` |
  | 403 | `FORBIDDEN` |
  | 404 | `NOT_FOUND` |
  | 409 | `CONFLICT` (checkout cart mismatch: `CART_CHANGED`) |
  | 500 | `INTERNAL_ERROR` |
  | 502 | `EXTERNAL_SERVICE_ERROR` |
  | 503 | `SERVICE_UNAVAILABLE` |
  | 504 | `GATEWAY_TIMEOUT` |

  `user-service` uses its own `ErrorCode` names as `error.code`.

### Pagination

Every list endpoint takes:

| Param | Type | Default | Rule |
|---|---|---|---|
| `page` | integer | 1 | ≥ 1 |
| `limit` | integer | 20 | 1..100 |

On the query string, except `POST /recommend` (in the request body). An invalid value returns
400 with `error.code = VALIDATION_FAILED`.

### Not wrapped

- `GET /health` on every service (incl. `api-gateway`) keeps returning `{ "status": "ok" }` —
  Docker healthchecks depend on it.
- `GET /health/ready` on `recommendation-service` returns `{ "status", "checks" }` (200 / 503) —
  see `recommendation-service.md`.
- `204 No Content` responses have no body.
- Multipart upload *requests* keep their form shape (the response is still wrapped).
- RabbitMQ message bodies (`order-checkout-saga.md`, `product-events.md`, `behavior-events.md`)
  are not wrapped.

## Request id (`X-Request-Id`, all HTTP services)

One id follows a request through every service, so the log lines of one request can be found
in each container's log.

- **Request header (optional).** A client may send `X-Request-Id`. A value matching
  `^[A-Za-z0-9-]{8,64}$` is kept; anything else (or no header) is replaced by a new UUID.
- **Response header.** `api-gateway` returns `X-Request-Id` on every routed response
  (including the 404 / 429 / 4xx it creates itself) and exposes it to the browser through CORS.
  CORS preflight responses and body-parse errors (malformed JSON, payload too large) are the
  exception — they are answered before the request-id middleware runs.
  `recommendation-service` and `face-processing-service` also echo it on their responses.
- **Forwarded downstream.** The gateway sends the id on every HTTP call to a downstream service
  (not on RabbitMQ messages);
  `recommendation-service` forwards it to `product-service` and `face-processing-service`.
- **Logs.** `api-gateway` prints one access line per request
  (`METHOD /path STATUS <ms>ms <requestId>`). `recommendation-service` and
  `face-processing-service` print the id in every application log line
  (`<time> <LEVEL> <logger> [<requestId>] <message>`, `[-]` outside a request; uvicorn's own
  lines keep their default format) plus one access line per request on logger `app.access`
  (`METHOD /path STATUS <ms>ms`, path percent-encoded).
- **Known gap.** A 500 caused by an unhandled exception in the two Python services may come
  back **without** the header. The gateway still puts its own `X-Request-Id` on the response to
  the client, and the service's log line for that 500 still carries the id.
- `product-service`, `order-service` and `user-service` receive the header but do not log or
  forward it yet. `payment-service` is reached only over RabbitMQ, so it never receives it.
