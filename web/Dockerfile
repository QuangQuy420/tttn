# Dockerfile — web (Next.js + TypeScript)
# ============================================================================
# Next.js App Router app (Node 20) — see ./README.md for the src/ layout.
# ============================================================================
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Next.js inlines NEXT_PUBLIC_* vars into the client bundle at `next build` time, not at
# container runtime — `.env`/`.env.*` are excluded from the build context (.dockerignore),
# so this must come in as a build ARG rather than relying on `env_file` (docker-compose.yml).
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
