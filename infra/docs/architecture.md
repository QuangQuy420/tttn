# Architecture

## Overview

Smart Eyewear is a **microservices** e-commerce system for eyeglasses with face-based
recommendation and virtual try-on. It runs **locally only** via Docker Compose.

## Style & principles

- **Polyrepo** — 8 independent repos, each with its own Dockerfile and CI.
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
| gateway   | TBD (Q2) | — |
| auth      | TBD (Q2) | Postgres `auth_db` |
| catalog   | TBD (Q2) | Postgres `catalog_db` |
| order     | TBD (Q2) | Postgres `order_db` + Redis (cart) |
| face      | Python + FastAPI + MediaPipe | S3 / MinIO (face images) |
| reco      | Python + FastAPI | reads catalog via API |
| web       | Next.js + TS | — (browser AR client-side) |

## Request flow (happy path)

```
browser → gateway → auth        (login → JWT)
browser → gateway → catalog     (browse)
browser → gateway → face        (upload photo → landmarks → face shape)   → S3/MinIO
browser → gateway → reco        (face shape → ranked products)            → catalog
browser (client-side)           (virtual try-on AR with MediaPipe + Canvas/Three.js)
browser → gateway → order       (cart in Redis → checkout → order)        → catalog
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
