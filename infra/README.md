# infra

Glue repo for the Smart Eyewear system (local only). Orchestration, seed data, shared
contracts, docs — no business logic.

## Hot-reload (watch mode)

```bash
docker compose -f docker-compose.yml -f docker-compose.watch.yml watch
```

If you also have a local, gitignored `docker-compose.override.yml` (e.g. a remapped Postgres
port), list it explicitly too — passing any `-f` disables Compose's auto-loaded override:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.watch.yml watch
```

This syncs source changes for `api-gateway`, `product-service`, `web`, and
`face-processing-service` straight into their running dev containers.

## Seed data

Loads `seed/products.json` into `product_db` (`product-service` only).

Local:

```bash
cd ../product-service && npm run seed
```

Inside a running container:

```bash
docker compose exec product-service node dist/seed.js
```
