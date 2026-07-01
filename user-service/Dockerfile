# Dockerfile — user-service
# ============================================================================
# ⚠️  BACKEND LANGUAGE PENDING (Open Question Q2: NestJS / Spring Boot / Go).
#     Fill this in once the team locks the stack. The image only needs to run
#     the layered app described in ./README.md (route -> service -> repository -> db).
# ============================================================================
#
# --- Example A: NestJS (Node 20) -------------------------------------------
# FROM node:20-alpine AS build
# WORKDIR /app
# COPY package*.json ./
# RUN npm ci
# COPY . .
# RUN npm run build
# FROM node:20-alpine
# WORKDIR /app
# COPY --from=build /app/node_modules ./node_modules
# COPY --from=build /app/dist ./dist
# EXPOSE ${PORT}
# CMD ["node", "dist/main.js"]
#
# --- Example B: Spring Boot (JDK 21) ---------------------------------------
# FROM eclipse-temurin:21-jdk AS build ... (mvn package) ... then run the jar
#
# --- Example C: Go ----------------------------------------------------------
# FROM golang:1.22 AS build ... (go build) ... distroless final stage
