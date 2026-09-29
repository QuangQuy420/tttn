#!/bin/sh
# Runs pending Alembic migrations before starting the app — local dev only, single instance,
# so no migration-lock/race-condition handling needed (see infra's docker-compose.yml: postgres
# is required healthy via `depends_on` before this container starts).
set -e

alembic upgrade head

exec "$@"
