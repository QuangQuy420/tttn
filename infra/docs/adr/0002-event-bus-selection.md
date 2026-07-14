# ADR 0002: Event Bus Technology Selection

## Status

Accepted

## Context

Smart Eyewear's East-West traffic (service ↔ service) is documented in
`infra/docs/architecture.md:15,18-19` as "internal REST (sync)", with a message broker noted
as "a future enhancement and is not used." In practice this is stronger than "not used yet" —
there is currently **no East-West traffic at all**. The only HTTP client code in the whole
workspace is `api-gateway`'s proxy services (`api-gateway/src/services/*-proxy.service.ts`),
and those are North-South (browser → gateway → one downstream service), not service-to-service
calls. No business service currently calls another business service.

The concrete flow used to validate this decision — updating or deleting a product from the
admin API — makes the point sharply: today it is a single hop, `web` → `api-gateway` →
`product-service`'s `PATCH`/`DELETE /products/:id`
(`product-service/src/routes/products.controller.ts:57-67`) → `ProductsService.update`/`.remove`
(`product-service/src/services/products.service.ts:145-190`), which only writes to Postgres. No
other service is called or notified — there is no `user-service` role check (no auth guard
exists on `/admin/*` yet) and no `recommendation-service` notification, because
`recommendation-service` has no application code yet.

We want to move from "services call each other directly over HTTP when they need to react to
something" to "services publish events to a shared broker; interested services subscribe" for
cases where the caller does not need an immediate answer. This requires picking a real,
standard message-broker technology — not a shortcut built on the Redis instance already in
`docker compose` — that fits this project's constraints: a single dev machine running everything
via `docker compose` (no Kubernetes, no managed cloud broker), and three live application
stacks to support (NestJS in `api-gateway`/`product-service`, Spring Boot in `user-service`,
FastAPI in `face-processing-service`/`recommendation-service`).

Three candidates were considered:

- **RabbitMQ** — a mature AMQP 0-9-1 broker, ships as a single container, has a built-in
  management UI (`rabbitmq-management` plugin), and has idiomatic, actively maintained clients
  for all three stacks: `@nestjs/microservices`' RabbitMQ transport (NestJS), `spring-boot-
  starter-amqp` (Spring Boot), and `aio-pika`/`pika` (FastAPI/Python).
- **Apache Kafka** — a distributed log built for high-throughput streaming and long retention.
  It needs more memory/CPU and more operational surface than this project needs: partitions and
  consumer-group rebalancing to reason about, and either a Zookeeper ensemble or a KRaft
  controller node to run alongside the brokers, even in a single-node "dev" setup. That is
  meaningfully heavier than one lightweight container for a graduation project with moderate,
  non-streaming traffic.
- **NATS** (core NATS) — very lightweight and simple to run as a single container. Its default
  delivery is at-most-once/fire-and-forget; reliable, persistent delivery needs JetStream, which
  is a bolt-on mode layered on top rather than the default behavior of the base broker. NATS also
  has a smaller community and less teaching/reference material than RabbitMQ, which matters for
  a project whose team is still learning the pattern.
- **Redis Pub/Sub or Streams** was explicitly rejected as the "reuse what we already have"
  shortcut. It was ruled out on purpose: the goal of this decision is to adopt a real,
  purpose-built message-broker technology with delivery guarantees and management tooling, not to
  repurpose the existing cache/session store for a job it wasn't chosen for.

## Decision

Use **RabbitMQ** as the event bus, added as a single new container in `infra/docker-compose.yml`
(image `rabbitmq:3-management-alpine`, AMQP on `5672`, management UI on `15672`).

Reasons, tied to this project's actual stacks and constraints:

- **Fits the single-machine `docker compose` constraint.** RabbitMQ runs as one container with no
  external coordination service (unlike Kafka's Zookeeper/KRaft requirement), so it slots into
  the existing "Infrastructure" section of `infra/docker-compose.yml` the same way `redis` and
  `minio` already do.
- **Mature, idiomatic clients in all three live stacks.** `@nestjs/microservices` has a built-in
  RabbitMQ transport for `api-gateway`/`product-service`; `spring-boot-starter-amqp` is a
  first-class Spring Boot starter for `user-service`; `aio-pika`/`pika` are the standard AMQP
  clients for the FastAPI services. No stack is left without well-supported tooling.
- **Built-in management UI.** The `rabbitmq-management` plugin (bundled in the `-management`
  image tag) gives a web console to inspect exchanges, queues, and messages without writing a
  consumer first — the same local-dev convenience already established by the MinIO console
  (`http://localhost:9001`) in this project.
- **Right-sized operational complexity.** This project's East-West traffic is, and will remain
  for a while, moderate-volume domain events (product changed, order placed), not a high-
  throughput streaming workload. RabbitMQ's topic-exchange/routing-key model maps directly onto
  that need without requiring partition/consumer-group tuning.
- **Reliable delivery is the default, not a bolt-on.** Unlike core NATS, durable queues and
  acknowledgements are native to RabbitMQ/AMQP, so "at least one consumer eventually gets this
  message" doesn't require an extra subsystem (JetStream) on top of the base broker.

A small, real proof-of-concept was implemented alongside this ADR (not just a paper
recommendation): `product-service` now publishes a `product.updated` event after a successful
admin `PATCH /products/:id`, and a `product.deleted` event after a successful admin `DELETE
/products/:id`, both to a `product-events` topic exchange on the new RabbitMQ container. The
admin's own update/delete call is unchanged — still a direct, synchronous REST response — the
publish is an additional, fire-and-forget side effect. This is publish-only: no consumer is
built in this pass, since `recommendation-service` (the natural future subscriber) has no
application code yet. The publish side was verified manually via the RabbitMQ management UI
(binding a temporary queue and inspecting delivered messages).

## Consequences

- **New operational dependency.** RabbitMQ is a new container that must be kept healthy in
  `docker compose` (healthcheck via `rabbitmq-diagnostics -q ping`, matching the existing
  `postgres`/`redis`/`minio` healthcheck pattern) and a new dependency every publishing/consuming
  service must reach. This is accepted as the cost of moving off ad hoc direct calls.
- **Not decided yet: event schema/contract format and versioning.** This ADR picks the broker,
  not the message shape. The proof-of-concept's `{ productId, occurredAt }` JSON body is
  deliberately minimal and not a proposal for the eventual schema standard. A follow-on decision
  is still needed on whether events should be plain JSON, a structured envelope (e.g.
  CloudEvents), and whether `infra/contracts` (today only holding REST OpenAPI specs, see
  `infra/contracts/README.md`) should be extended to also hold versioned event schemas, or
  whether that belongs in a separate `infra/events` convention. Out of scope here.
- **Candidate flows to become event-driven** (per `infra/docs/architecture.md`'s request-flow
  section): the order/payment flow (`order-service` → `payment-service`, once their language is
  chosen — see architecture doc's Q2), and `recommendation-service`'s stock/catalog-update flow,
  which the proof-of-concept's `product.updated`/`product.deleted` events are the first concrete
  step toward once a consumer exists.
- **Flows that should stay synchronous.** Anything where the caller needs an immediate
  success/failure answer should stay a direct REST call — most notably login (`user-service`),
  where the browser cannot proceed without a token in the same request/response cycle. The admin
  product update/delete call itself is the same case: it stays synchronous, and the event is
  purely an additional side effect, not a replacement.
- **No consumer exists yet.** Messages published to the `product-events` exchange with no bound
  queue are simply dropped — expected RabbitMQ behavior for an unbound topic exchange, not a bug.
  A real consumer (e.g. in `recommendation-service`) is a separate, larger effort once that
  service has application code.
