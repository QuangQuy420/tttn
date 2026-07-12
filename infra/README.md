# infra

Glue repo for the Smart Eyewear system (local only). Contains the orchestration, seed data,
shared API contracts, and documentation. Holds **no business logic**.

## Contents

```
docker-compose.yml          # brings up all services + Postgres + Redis + MinIO
.env.example                # central env (copy to .env)
scripts/init-multiple-dbs.sh# creates one Postgres database per service
scripts/sync-contracts.sh   # versioned-copy helper (see docs/adr/0001-contract-sharing-mechanism.md)
seed/                       # sample products + face-shape→frame mapping
contracts/                  # shared OpenAPI/proto contracts (consumed by other repos)
docs/                       # architecture.md + adr/ (architecture decision records)
```

## Run the whole system

```bash
cp .env.example .env
# also copy each service env (from the workspace root):
#   for s in api-gateway user-service product-service order-service payment-service face-processing-service recommendation-service web; do cp ../$s/.env.example ../$s/.env; done
docker compose up --build
```

- Web:           http://localhost:3000
- Gateway:       http://localhost:8080
- MinIO console: http://localhost:9001

## Hot-reload for local dev

`docker compose up --build` runs the production build of each service (compiled `dist`/`.next`,
no source mount) — code changes need a manual rebuild. To get hot-reload instead, use the
`docker-compose.watch.yml` overlay (`api-gateway`, `product-service`, `web` only — it switches
their build `target` to each Dockerfile's `dev` stage and syncs source changes in):

```bash
docker compose -f docker-compose.yml -f docker-compose.watch.yml watch
```

Saved changes under each service's `src/` are synced straight into the running container, where
Nest's `--watch` / Next's `next dev` picks them up and reloads. Changing a `package.json` triggers
a full rebuild + restart instead, since a synced file can't add packages to an already-built
`node_modules`. This overlay is *not* auto-loaded like `docker-compose.override.yml` — it only
applies when passed explicitly with `-f`, so plain `docker compose up --build` still gives you the
production build.

### What actually builds/runs today

- **`api-gateway`, `product-service`, `web`** — real apps (NestJS, NestJS, Next.js
  respectively), each with a working Dockerfile and a `/health` (or `/api/health` for `web`)
  endpoint wired into `docker-compose.yml`'s healthchecks. `docker compose up --build` against
  just these three (+ Postgres/Redis/MinIO) comes up clean and green:
  `docker compose up --build postgres redis minio product-service api-gateway web`.
- **`user-service`, `order-service`, `payment-service`** — folder scaffolds only; their
  `Dockerfile`s are fully commented-out placeholders (backend language still TBD, Q2). Running
  `docker compose build`/`up` with **no service arguments** (the whole stack) will fail on these
  three. `api-gateway` no longer `depends_on` `user-service` for this reason (it doesn't call it
  yet either — edge JWT / `/api/auth/*` proxying is deferred, see Q3); it will be re-added once
  that proxy exists.
- **`face-processing-service`, `recommendation-service`** — have real, non-placeholder
  Dockerfiles (`python:3.11-slim` + their `requirements.txt`) and layered folder scaffolds
  (`app/routers|services|repositories|db|schemas|core`), so `docker compose build` on them
  *succeeds*. However neither has an `app/main.py` yet (both Dockerfiles' `CMD` points at
  `app.main:app`, which doesn't exist), so their **containers fail to start**. Out of scope for
  this sprint (Sprint 2/3 work per the Sprint Goal PDF) — don't rely on either being up.

See [`docs/architecture.md`](docs/architecture.md) for the full design.
