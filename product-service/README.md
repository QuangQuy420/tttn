# product-service

**Product Service.** Products, categories, frame attributes, and list/detail/search.

> ✅ **Language: NestJS + TypeScript** (locked in). App scaffolded, `Dockerfile` filled in.

## Responsibilities
- `GET /products` (filter/paginate), `GET /products/:id`, `GET /categories`.
- Frame attributes (`frameShape`, size, color, material, price, images) — normalized so
  `recommendation-service` can reuse them.

## Structure (route → service → repository → db, with DI / SOLID)
```
src/
  routes/         # HTTP controllers, DTO validation
  services/       # catalog use-cases (listing, filtering, detail)
  repositories/   # product/category data access (interfaces + impl)
  db/             # entities/models, migrations/, connection/ORM setup
  config/         # DI container, env/config, bootstrap
  middlewares/    # error handler, logging
test/             # supertest e2e tests (unit *.spec.ts colocated under src/)
```

## Data
- Postgres database `product_db` (`products`, `categories`). See [`.env.example`](.env.example).
- Seed data lives in `infra/seed`.
