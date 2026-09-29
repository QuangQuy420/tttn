# Shared API Contracts

Contracts shared across services. Each producing service publishes its contract here; consumers
take a **versioned copy** (see `infra/docs/adr/0001-contract-sharing-mechanism.md` and
`infra/scripts/sync-contracts.sh`).

```
contracts/
  product-service.openapi.yaml   # product-service REST API (OpenAPI 3)
  order-checkout-saga.md         # order-saga-events exchange (checkout saga, RabbitMQ)
  product-events.md              # product-events exchange (catalog changes → cart sync, RabbitMQ)
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
- `204 No Content` responses have no body.
- Multipart upload *requests* keep their form shape (the response is still wrapped).
- RabbitMQ message bodies (`order-checkout-saga.md`, `product-events.md`) are not wrapped.
