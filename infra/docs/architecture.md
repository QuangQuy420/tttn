# Architecture

## Overview

Smart Eyewear is a **microservices** e-commerce system for eyeglasses with face-based
recommendation and virtual try-on. It runs **locally only** via Docker Compose.

## Style & principles

- **Polyrepo** — 9 independent repos, each with its own Dockerfile and CI.
- **API-first** — every service publishes an OpenAPI contract in `infra/contracts`.
- **Database-per-service** — services do not share tables; they integrate over APIs.
- **North-South vs East-West**
  - *North-South* (browser → system): all external traffic enters via the **API Gateway**
    (one origin, central CORS, edge JWT verification, rate-limit).
  - *East-West* (service ↔ service): internal **REST** (sync). A message broker is a
    future enhancement and is not used.

## Components

| Component | Tech | Store |
|-----------|------|-------|
| api-gateway              | TBD (Q2) | — |
| user-service             | TBD (Q2) | Postgres `auth_db` |
| product-service          | TBD (Q2) | Postgres `catalog_db` |
| order-service            | TBD (Q2) | Postgres `order_db` + Redis (cart) |
| payment-service          | TBD (Q2) | Postgres `payment_db` (internal-only, called by `order-service`) |
| face-processing-service  | Python + FastAPI + MediaPipe | S3 / MinIO (face images) |
| recommendation-service   | Python + FastAPI | reads product-service via API |
| web                      | Next.js + TS | — (browser AR client-side) |

## Request flow (happy path)

```
browser → api-gateway → user-service          (login → JWT)
browser → api-gateway → product-service       (browse)
browser → api-gateway → face-processing-service   (upload photo → landmarks → face shape)   → S3/MinIO
browser → api-gateway → recommendation-service    (face shape → ranked products)             → product-service
browser (client-side)                         (virtual try-on AR with MediaPipe + Canvas/Three.js)
browser → api-gateway → order-service         (cart in Redis → checkout → order)             → product-service, payment-service
```

## Cross-cutting decisions (to record as ADRs)

- **Backend language (Q2)** — pending team decision (NestJS / Spring Boot / Go).
- **JWT verification across polyrepo** — either (a) gateway verifies at the edge and injects
  a trusted `X-User-*` header for internal services, or (b) each service verifies using a
  shared `JWT_SECRET`/JWKS. Decide and record.
- **Contract sharing** — `infra/contracts` consumed via git submodule or versioned copy.
- **Face image storage** — S3, local via MinIO; private bucket + presigned URLs + lifecycle/delete policy.

## Layered design (per backend service)

`routes (controller) → services (business) → repositories (data access) → db`, wired with
dependency injection. See the root `README.md` for the full diagram and SOLID notes.

## Known local-only constraints

- **Webcam** (`getUserMedia`) only works on `localhost`/HTTPS → open the web app at
  `http://localhost:3000`.
- **MediaPipe in Docker** — wheels are architecture-sensitive (x86 vs Apple Silicon);
  pin a known-good base image / use `platform: linux/amd64` if needed.
