# catalog

**Catalog service.** Products, categories, frame attributes, and list/detail/search.

> ⛔ **Language: TBD (Open Question Q2 — NestJS / Spring Boot / Go).**
> The `Dockerfile` is a placeholder until the stack is chosen.

## Responsibilities
- `GET /products` (filter/paginate), `GET /products/:id`, `GET /categories`.
- Frame attributes (`frameShape`, size, color, material, price, images) — normalized so
  `reco` can reuse them.

## Structure (route → service → repository → db, with DI / SOLID)
```
src/
  routes/         # HTTP controllers, DTO validation
  services/       # catalog use-cases (listing, filtering, detail)
  repositories/   # product/category data access (interfaces + impl)
  db/             # entities/models, migrations/, connection/ORM setup
  config/         # DI container, env/config, bootstrap
  middlewares/    # error handler, logging
tests/
```

## Data
- Postgres database `catalog_db` (`products`, `categories`). See [`.env.example`](.env.example).
- Seed data lives in `infra/seed`.
