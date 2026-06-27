# auth

**Auth & User service.** Registration, login, JWT issuance, and user profiles.

> ⛔ **Language: TBD (Open Question Q2 — NestJS / Spring Boot / Go).**
> The `Dockerfile` is a placeholder until the stack is chosen.

## Responsibilities
- `POST /register`, `POST /login` → issue JWT (passwords hashed with bcrypt/argon2).
- User profile endpoints.
- Provide a reusable JWT-verification mechanism (see ADR on JWT across polyrepo).

## Structure (route → service → repository → db, with DI / SOLID)
```
src/
  routes/         # HTTP controllers, DTO validation (no business logic)
  services/       # business rules (hashing, token issuance, profile use-cases)
  repositories/   # data access interfaces + implementations (the only DB layer)
  db/             # entities/models, migrations/, connection/ORM setup
  config/         # DI container, env/config, bootstrap
  middlewares/    # auth guard, error handler, logging
tests/            # unit (services/repos) + integration
```

## Data
- Postgres database `auth_db` (table `users`). See [`.env.example`](.env.example).
