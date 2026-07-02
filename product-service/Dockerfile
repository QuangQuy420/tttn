# Dockerfile — product-service
# ============================================================================
# NestJS (Node 20) — layered app described in ./README.md
# (route -> service -> repository -> db), built with TypeORM against Postgres.
# ============================================================================
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE ${PORT}
CMD ["node", "dist/main.js"]
