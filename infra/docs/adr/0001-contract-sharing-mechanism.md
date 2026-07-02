# ADR 0001: Contract Sharing Mechanism

## Status

Accepted

## Context

Smart Eyewear is split into multiple backend services (`api-gateway`, `user-service`,
`product-service`, `order-service`, `payment-service`, `face-processing-service`,
`recommendation-service`) plus `web`, each meant to own its own OpenAPI contract (see
"API-first" in `infra/docs/architecture.md`). Those contracts live under `infra/contracts`
so every repo can consume them.

Today the whole system is a **monorepo**: all service folders are siblings in one git repo,
built/run together via `infra/docker-compose.yml`. `infra/docs/architecture.md` already
states the repo is "Monorepo, split-ready" — structured so each service folder can later be
extracted into its own repo without a rewrite.

Two mechanisms were on the table for how a consuming service (e.g. `api-gateway` typing its
proxy calls, or `web` typing its API client, or `recommendation-service` typing its
`product-service` client) gets access to another service's contract:

1. **Git submodule** — `infra/contracts` (or each service's contract) pulled in as a
   submodule of every consumer.
2. **Versioned copy** — the producing service publishes its OpenAPI file into
   `infra/contracts/<service>.openapi.yaml`; consumers copy the file(s) they need into their
   own repo (e.g. `<consumer>/contracts/`) at a point in time, and re-sync deliberately when
   the producer's contract changes.

`infra/contracts/README.md` already documents both options and says the mechanism was
"locked in STORY-1.1", but no ADR actually existed to record the decision or the reasoning —
this ADR fills that gap.

## Decision

Use a **versioned copy**, not a git submodule.

- Each service publishes its own OpenAPI contract into `infra/contracts/<service>.openapi.yaml`
  (see `infra/contracts/README.md` for the file list).
- Consumers copy the specific contract file(s) they depend on into their own repo (e.g. a
  `contracts/` folder inside the consumer, or generated types committed alongside the
  consumer's code) at a point in time — not a live/linked reference.
- The copy step is a small, explicit, scriptable action (see `infra/scripts/sync-contracts.sh`)
  run deliberately when a consumer wants to pick up a contract change, not automatically on
  every build.

## Consequences

- **Why not git submodules today:** the system is currently a single monorepo — every service
  folder already sits in the same working tree and the same commit history. A submodule would
  add pointer-commit bookkeeping (updating the submodule ref, detached-HEAD footguns, contributors
  needing to know `git submodule update --init`) for no real benefit while everything already
  ships from one repo/one `docker compose up`. It solves a polyrepo problem the codebase doesn't
  have yet.
- **Why versioned copy works today and later:** it's a plain file copy, so it needs no new
  tooling beyond a small sync script, and it degrades gracefully if/when the monorepo is split
  into polyrepos later — each extracted service repo just keeps copying from (or, post-split,
  fetching a release artifact of) the `infra/contracts` source of truth, or promotes the same
  copy step to pull from the producer's now-separate repo instead. No structural change is
  needed at split time, only a change to where the copy is sourced from.
- **Trade-off accepted:** a versioned copy can drift — a consumer's copy can go stale if nobody
  re-runs the sync after a producer changes its contract. This is accepted for now given the
  small team size and monorepo visibility (a contract change and its consumers are usually in the
  same PR or reviewable diff); revisit if drift becomes a recurring problem (e.g. move to
  generated-client-in-CI or a real package registry).
- Each service's contract is code-first for now (written from the real implementation — see the
  Sprint 1 plan's Q7); contract-first is a possible future direction but not required by this
  decision.
- This ADR does not decide *how* consumers keep their copy in sync automatically (e.g. CI check
  that fails on drift) — only that "copy, not submodule" is the mechanism. A CI drift-check can be
  added later without revisiting this decision.
