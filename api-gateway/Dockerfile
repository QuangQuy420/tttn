# Dockerfile — api-gateway service
# ============================================================================
# NestJS (Node 24) — layered app described in ./README.md
# (routes -> services -> config; gateway proxies downstream, no db layer).
# ============================================================================
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# `dev` target: used by infra/docker-compose.watch.yml (docker compose watch) for hot-reload
# during local development — keeps devDependencies and runs Nest's own --watch compiler.
FROM deps AS dev
ENV NODE_ENV=development
CMD ["npm", "run", "start:dev"]

FROM deps AS build
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/main.js"]
