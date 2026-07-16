#!/bin/sh
# Runs pending TypeORM migrations before starting the app — local dev only, single instance,
# so no migration-lock/race-condition handling needed (see infra's docker-compose.yml: postgres
# is required healthy via `depends_on` before this container starts).
#
# The prod image (final stage) only ships compiled `dist/` + `node_modules` (no package.json,
# no ts-node) — CLAUDE.md documents `node_modules/.bin/typeorm migration:run -d
# dist/db/data-source.js` as the container-safe command. The `dev` stage still has the full
# source + devDependencies (ts-node), so it uses the same CLI the `npm run migration:run` script
# wraps (`typeorm-ts-node-commonjs -d src/db/data-source.ts`).
set -e

if [ -f dist/db/data-source.js ]; then
  node_modules/.bin/typeorm migration:run -d dist/db/data-source.js
else
  node_modules/.bin/typeorm-ts-node-commonjs -d src/db/data-source.ts migration:run
fi

exec "$@"
