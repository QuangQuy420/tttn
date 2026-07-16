# Dockerfile — product-service
# ============================================================================
# NestJS (Node 24) — layered app described in ./README.md
# (route -> service -> repository -> db), built with TypeORM against Postgres.
# ============================================================================
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN chmod +x entrypoint.sh

# `dev` target: used by infra/docker-compose.watch.yml (docker compose watch) for hot-reload
# during local development — keeps devDependencies and runs Nest's own --watch compiler.
FROM deps AS dev
ENV NODE_ENV=development
ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "run", "start:dev"]

FROM deps AS build
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/entrypoint.sh ./entrypoint.sh
EXPOSE ${PORT}
# Runs pending TypeORM migrations before the app starts (see entrypoint.sh) — every
# `docker compose up`, not just the first one.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/main.js"]
