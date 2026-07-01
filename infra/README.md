# infra

Glue repo for the Smart Eyewear system (local only). Contains the orchestration, seed data,
shared API contracts, and documentation. Holds **no business logic**.

## Contents

```
docker-compose.yml          # brings up all services + Postgres + Redis + MinIO
.env.example                # central env (copy to .env)
scripts/init-multiple-dbs.sh# creates one Postgres database per service
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

> ⚠️ `api-gateway`/`user-service`/`product-service`/`order-service`/`payment-service` have
> placeholder Dockerfiles until backend language (Q2) is chosen — they won't build until then.

See [`docs/architecture.md`](docs/architecture.md) for the full design.
