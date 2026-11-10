"""Step `make publish`: publish simulated events to RabbitMQ (plan 09, T4 / AC7).

Each row of `--interactions` becomes one `behavior-events` message (contract
`infra/contracts/behavior-events.md`): routing key `behavior.<eventType lowercase>`, camelCase JSON
body, `source="simulator"`, `occurredAt` ISO-8601 with `+00:00`, AMQP `message_id = eventId`.
The exchange is declared exactly as the contract (topic, durable); publisher confirms +
`mandatory=True` make an unroutable event fail loudly, so recommendation-service must already be
running (its queue `recommendation-service.behavior-events` is bound to `behavior.*`).
The consumer de-duplicates by `eventId`, so publishing the same seeded file twice stores it once.

Refuses when `run_meta.json` beside the file is missing or says `catalog_source: seed`: seed
product ids are `uuid5(sku)`, not real products. Broker URL: env `RABBITMQ_URL`
(default `amqp://guest:guest@localhost:5672/`).
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from recsys.common import RUN_META_JSON, fail, read_interactions, read_json

EXCHANGE = "behavior-events"
SOURCE = "simulator"
DEFAULT_RABBITMQ_URL = "amqp://guest:guest@localhost:5672/"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--interactions", type=Path, default=Path("data/sim/interactions.parquet"))
    parser.add_argument("--rate", type=float, default=500.0, help="max events per second (default 500)")
    return parser


def check_publishable(interactions: Path) -> None:
    """Stop unless the simulator run used the real (API) catalog."""
    meta = read_json(interactions.parent / RUN_META_JSON)
    if meta is None:
        fail(
            f"{interactions.parent / RUN_META_JSON} is missing - only a simulator run made with the API catalog "
            "can be published"
        )
    if meta.get("catalog_source") != "api":
        fail(
            f"{interactions} was simulated with catalog_source={meta.get('catalog_source')!r}: its product ids "
            "are uuid5(sku), not real products. Re-run `simulate --catalog-source api` with the stack up."
        )


def to_message(row) -> tuple[str, dict]:
    """(routing key, contract payload) of one interaction row."""
    payload = {
        "eventId": row.event_id,
        "eventType": row.event_type,
        "userId": row.user_id,
        "productId": row.product_id,
        "occurredAt": row.occurred_at.to_pydatetime().isoformat(),
        "source": SOURCE,
        "context": json.loads(row.context) if row.context else {},
    }
    return f"behavior.{row.event_type.lower()}", payload


def publish_file(interactions: Path, rate: float = 500.0) -> int:
    """Publish every row with confirms; returns the number of published events."""
    import pika

    check_publishable(interactions)
    df = read_interactions(interactions)
    url = os.environ.get("RABBITMQ_URL", DEFAULT_RABBITMQ_URL)
    connection = pika.BlockingConnection(pika.URLParameters(url))
    published = 0
    try:
        channel = connection.channel()
        channel.exchange_declare(exchange=EXCHANGE, exchange_type="topic", durable=True)
        channel.confirm_delivery()
        min_interval = 1.0 / rate if rate > 0 else 0.0
        for row in df.itertuples(index=False):
            routing_key, payload = to_message(row)
            started = time.monotonic()
            # Raises pika.exceptions.UnroutableError / NackError when the broker cannot route/store it.
            channel.basic_publish(
                exchange=EXCHANGE,
                routing_key=routing_key,
                body=json.dumps(payload).encode("utf-8"),
                properties=pika.BasicProperties(
                    content_type="application/json", delivery_mode=2, message_id=row.event_id
                ),
                mandatory=True,
            )
            published += 1
            if published % 5000 == 0:
                print(f"published {published}/{len(df)}")
            wait = min_interval - (time.monotonic() - started)
            if wait > 0:
                time.sleep(wait)
    finally:
        connection.close()
    print(f"published {published} events from {interactions} to exchange {EXCHANGE!r} ({url.split('@')[-1]})")
    return published


def main() -> None:
    args = build_parser().parse_args()
    publish_file(args.interactions, args.rate)


if __name__ == "__main__":
    main()
