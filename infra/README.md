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
- RabbitMQ UI:   http://localhost:15672 (guest/guest)

## Hot-reload for local dev

`docker compose up --build` runs the production build of each service (compiled `dist`/`.next`,
no source mount) — code changes need a manual rebuild. To get hot-reload instead, use the
`docker-compose.watch.yml` overlay (`api-gateway`, `product-service`, `web`, and
`face-processing-service` — it switches their build `target` to each Dockerfile's `dev` stage and
syncs source changes in):

```bash
docker compose -f docker-compose.yml -f docker-compose.watch.yml watch
```

Saved changes under each service's `src/` (or `app/` for `face-processing-service`) are synced
straight into the running container, where Nest's `--watch` / Next's `next dev` / uvicorn's
`--reload` picks them up and reloads. Changing a `package.json`/`requirements.txt` triggers a full
rebuild + restart instead, since a synced file can't add packages to an already-built
`node_modules`/site-packages. This overlay is *not* auto-loaded — it only applies when passed
explicitly with `-f`, so plain `docker compose up --build` still gives you the production build.

> ⚠️ Passing `-f` explicitly (as above) is itself the reason `watch` needs an extra flag if you
> also have a local, gitignored `docker-compose.override.yml` (e.g. remapping `postgres`'s port —
> see the "port is already allocated" note below): **Compose only auto-loads
> `docker-compose.override.yml` when no `-f` is given at all.** Once you pass any `-f`, you must
> list every file you want, override included, or its settings (like a remapped Postgres port)
> silently drop out and you'll hit port conflicts on `watch` that don't happen on plain
> `docker compose up --build`:
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.watch.yml watch
> ```

### What actually builds/runs today

- **`api-gateway`, `product-service`, `web`, `face-processing-service`** — real apps (NestJS,
  NestJS, Next.js, Python/FastAPI respectively), each with a working Dockerfile and a `/health`
  (or `/api/health` for `web`) endpoint wired into `docker-compose.yml`'s healthchecks.
  `docker compose up --build` against these four (+ Postgres/MinIO, and Redis for the first three)
  comes up clean and green:
  `docker compose up --build postgres redis minio product-service api-gateway web face-processing-service`.
  `face-processing-service` also needs its own Postgres database (`face_processing_db`, created
  automatically on a *fresh* `postgres` volume via `POSTGRES_MULTIPLE_DATABASES` — see the
  `init-multiple-dbs.sh` note above; on an *existing* volume from before this database was added,
  create it once by hand: `docker compose exec postgres psql -U app -d postgres -c "CREATE DATABASE face_processing_db;"`,
  then `docker compose exec face-processing-service alembic upgrade head`).
- **`user-service`** — real Spring Boot app (Maven, JDK 25) with a working multi-stage Dockerfile,
  no longer gated behind `not-ready`. It has no `/actuator` health endpoint, so the Compose
  healthcheck probes the port directly via `bash`'s `/dev/tcp` (the `eclipse-temurin` JRE base
  image ships neither `wget` nor `curl`). `application.yml`'s `datasource`/`server.port`/`jwt.*`
  keys are hardcoded for the other dev's local (non-Docker) setup —
  `UserServiceApplication.main()` overrides them from `PORT`/`DATABASE_URL`/`JWT_SECRET`/
  `JWT_EXPIRES_IN` (the same env-var convention every other service's `.env` uses) only when those
  env vars are present, so local dev outside Docker is unaffected.
- **`order-service`, `payment-service`** — folder scaffolds only; their `Dockerfile`s are fully
  commented-out placeholders (backend language still TBD, Q2). Running `docker compose build`/`up`
  with **no service arguments** (the whole stack) will fail on these two. `api-gateway` doesn't
  `depends_on` `user-service` yet either way — it doesn't call it yet (edge JWT / `/api/auth/*`
  proxying is deferred, see Q3); that dependency will be added once that proxy exists.
- **`recommendation-service`** — has a real, non-placeholder Dockerfile (`python:3.11-slim` + its
  `requirements.txt`) and a layered folder scaffold (`app/routers|services|repositories|db|schemas|core`),
  so `docker compose build` on it *succeeds*. However it has no `app/main.py` yet (its Dockerfile's
  `CMD` points at `app.main:app`, which doesn't exist), so its **container fails to start**. Out of
  scope for this sprint — don't rely on it being up.

See [`docs/architecture.md`](docs/architecture.md) for the full design.
