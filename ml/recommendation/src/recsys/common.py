"""Shared I/O helpers for the recommendation dataset pipeline (plan 09).

Every step is run as `python -m recsys.<step>` from `ml/recommendation/` with
`PYTHONPATH=../../recommendation-service:src` (see the Makefile), so `app.ml.features` - the
single source of the feature code (train/serve parity) - is importable.

Both interaction sources (the simulator in `data/sim/`, the real export in `data/real/`) write
the same parquet schema (`INTERACTIONS_SCHEMA`): ids, `event_type`, `source` as strings,
`occurred_at` as `timestamp[us, tz=UTC]`, `context` as a JSON string, rows sorted by
(`occurred_at`, `event_id`).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pyarrow as pa
import pyarrow.parquet as pq

if TYPE_CHECKING:
    import pandas as pd

# Folder `ml/recommendation/` (relative paths in the CLI defaults resolve against the cwd).
ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = ROOT.parents[1]
SEED_PRODUCTS_JSON = REPO_ROOT / "infra" / "seed" / "products.json"

RUN_META_JSON = "run_meta.json"
DATASET_META_JSON = "dataset_meta.json"
PERSONAS_PARQUET = "personas.parquet"

INTERACTION_COLUMNS = ["event_id", "user_id", "product_id", "event_type", "occurred_at", "source", "context"]
INTERACTIONS_SCHEMA = pa.schema(
    [
        ("event_id", pa.string()),
        ("user_id", pa.string()),
        ("product_id", pa.string()),
        ("event_type", pa.string()),
        ("occurred_at", pa.timestamp("us", tz="UTC")),
        ("source", pa.string()),
        ("context", pa.string()),
    ]
)


def fail(message: str) -> None:
    """Print a clear error and exit with status 1 (CLI boundary)."""
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def write_table(table: pa.Table, path: Path) -> None:
    """Write a parquet file deterministically (no pandas index, fixed compression)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, path, compression="zstd")


def write_interactions(columns: dict[str, list[Any]], path: Path) -> int:
    """Write interaction columns (already sorted by occurred_at, event_id) with `INTERACTIONS_SCHEMA`."""
    table = pa.Table.from_pydict({name: columns[name] for name in INTERACTION_COLUMNS}, schema=INTERACTIONS_SCHEMA)
    write_table(table, path)
    return table.num_rows


def read_interactions(path: Path) -> pd.DataFrame:
    """Read an interactions parquet; checks the columns and returns rows sorted by (occurred_at, event_id)."""
    if not path.is_file():
        fail(f"{path} not found")
    table = pq.read_table(path)
    missing = [name for name in INTERACTION_COLUMNS if name not in table.column_names]
    if missing:
        fail(f"{path} is missing columns {missing}")
    df = table.select(INTERACTION_COLUMNS).to_pandas()
    return df.sort_values(["occurred_at", "event_id"], kind="stable").reset_index(drop=True)


def write_json(data: dict[str, Any], path: Path) -> None:
    """Pretty, key-sorted JSON (stable bytes for the same content)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def read_json(path: Path) -> dict[str, Any] | None:
    """Parsed JSON, or None when the file does not exist."""
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
