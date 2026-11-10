"""Step `make export-real`: export real interactions from `recommendation_db` (plan 09, T5 / AC6).

Reads `interactions` (plan 04) with sync SQLAlchemy + psycopg and writes the simulator's parquet
schema (`recsys.common.INTERACTIONS_SCHEMA`: UUIDs as strings, `occurred_at` UTC, `context` as a
key-sorted JSON string), rows sorted by (occurred_at, event_id). Default output
`data/real/interactions.parquet` - its own folder, never beside a simulator `run_meta.json` /
`personas.parquet`. DSN: env `RECSYS_DB_URL`, e.g.
`postgresql+psycopg://app:app@localhost:5432/recommendation_db`.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import timezone
from pathlib import Path

from recsys.common import fail, write_interactions

QUERY = (
    "SELECT event_id, user_id, product_id, event_type, occurred_at, source, context "
    "FROM interactions{where} ORDER BY occurred_at, event_id"
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=Path("data/real/interactions.parquet"))
    parser.add_argument(
        "--exclude-source",
        action="append",
        default=[],
        metavar="NAME",
        help="drop events of this source (repeatable; e.g. `simulator` keeps only real events)",
    )
    return parser


def _context_json(value) -> str:
    if value is None:
        return "{}"
    if isinstance(value, str):
        value = json.loads(value)
    return json.dumps(value, sort_keys=True)


def export(db_url: str, out: Path, exclude_sources: list[str]) -> int:
    from sqlalchemy import bindparam, create_engine, text

    where = " WHERE source NOT IN :excluded" if exclude_sources else ""
    statement = text(QUERY.format(where=where))
    params = {}
    if exclude_sources:
        statement = statement.bindparams(bindparam("excluded", expanding=True))
        params["excluded"] = list(exclude_sources)

    engine = create_engine(db_url)
    try:
        with engine.connect() as connection:
            rows = connection.execute(statement, params).all()
    finally:
        engine.dispose()

    rows = sorted(rows, key=lambda r: (r.occurred_at, str(r.event_id)))  # UUID order != string order
    columns = {
        "event_id": [str(r.event_id) for r in rows],
        "user_id": [str(r.user_id) for r in rows],
        "product_id": [str(r.product_id) for r in rows],
        "event_type": [getattr(r.event_type, "value", r.event_type) for r in rows],
        "occurred_at": [r.occurred_at.astimezone(timezone.utc) for r in rows],
        "source": [r.source for r in rows],
        "context": [_context_json(r.context) for r in rows],
    }
    return write_interactions(columns, out)


def main() -> None:
    args = build_parser().parse_args()
    db_url = os.environ.get("RECSYS_DB_URL")
    if not db_url:
        fail("set RECSYS_DB_URL, e.g. postgresql+psycopg://app:app@localhost:5432/recommendation_db")
    n_rows = export(db_url, args.out, args.exclude_source)
    excluded = f" (excluded sources: {', '.join(args.exclude_source)})" if args.exclude_source else ""
    print(f"wrote {n_rows} interactions to {args.out}{excluded}")


if __name__ == "__main__":
    main()
