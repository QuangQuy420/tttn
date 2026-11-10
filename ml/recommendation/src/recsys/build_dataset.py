"""Step `make dataset`: interactions -> ranking dataset (plan 09, T6).

1. Catalog: when `run_meta.json` sits beside `--interactions`, its `catalog_source` is used (a
   different non-`auto` `--catalog-source` stops; `api` never falls back to the seed). Events on
   products outside the catalog are dropped (> 5% -> fail).
2. Labels (roadmap C4, AC8): UNLIKE cancellation over the whole log, then one positive per
   (user, product): `ts` = the pair's first remaining event, label = max graded label. A pair left
   with no event (a cancelled LIKE) gets no row but still counts as touched.
3. Split (AC10): per user, positives ordered by (ts, product_id); users with >= 3 positives ->
   last = test, second-last = val, rest = train; others -> train only.
4. Negatives (AC9): per positive, `min(20, untouched)` products the user never touched in the
   whole log - 10 uniform + 10 popularity-weighted (`decayed_popularity + 1e-6` at `ts`), no
   duplicates, one half topped up from the other; label 0, same `ts`; `group_id` = the positive
   + its negatives. Seeded (`--seed`).
5. Features (AC11, AC12): only `app.ml.features` (single source, train/serve parity), from events
   strictly before the group's `ts`: the user's events for the profile, one time-ordered sweep of
   `ProductStats` (snapshot before the events at `ts` are added). No feature is face-derived.
6. Outputs in `--out-dir` (default `<interactions folder>/dataset/`): `train/val/test.parquet`
   and `eval_candidates.parquet` (per test user: every catalog product except that user's
   train/val positives and touched-without-row pairs; the test product keeps its label), columns
   `user_id, product_id, group_id, label, ts, <63 features>`, rows ordered by `group_id`; plus
   `dataset_meta.json`. Ends by writing the dataset card (`recsys.dataset_card`).
"""
from __future__ import annotations

import argparse
import time
from bisect import bisect_left
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pyarrow as pa

from recsys.catalog import CATALOG_SOURCES, DEFAULT_CATALOG_URL, catalog_source_of, load_catalog, to_products
from recsys.common import DATASET_META_JSON, RUN_META_JSON, fail, read_interactions, read_json, write_json, write_table

SPLITS = ("train", "val", "test")
EVAL_CANDIDATES = "eval_candidates"
N_NEGATIVES = 20
MAX_DROPPED_SHARE = 0.05
POPULARITY_EPS = 1e-6


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--interactions", type=Path, default=Path("data/sim/interactions.parquet"))
    parser.add_argument("--catalog-source", choices=CATALOG_SOURCES, default="auto")
    parser.add_argument("--catalog-url", default=DEFAULT_CATALOG_URL)
    parser.add_argument("--out-dir", type=Path, default=None, help="default: <interactions folder>/dataset/")
    parser.add_argument("--card-dir", type=Path, default=Path("reports"))
    parser.add_argument("--seed", type=int, default=42)
    return parser


@dataclass(frozen=True)
class Group:
    """One positive (user, product) and the split it belongs to."""

    user_id: str
    product_id: str
    ts: datetime
    label: int
    split: str


def resolve_catalog(interactions: Path, requested: str, url: str):
    meta = read_json(interactions.parent / RUN_META_JSON)
    if meta is None:
        return load_catalog(requested, url)
    source = meta["catalog_source"]
    if requested != "auto" and requested != source:
        fail(f"{interactions.parent / RUN_META_JSON} says catalog_source={source!r} but --catalog-source={requested!r}")
    return load_catalog(source, url)


def positives_and_touched(events, ev_labels: dict[str, int], cancel) -> tuple[dict, dict[str, set[str]]]:
    """(positives {(user, product): (ts, label)}, touched {user: products}) over the whole log."""
    touched: dict[str, set[str]] = defaultdict(set)
    for event in events:
        touched[event.user_id].add(event.product_id)
    positives: dict[tuple[str, str], tuple[datetime, int]] = {}
    for event in cancel(events):
        key = (event.user_id, event.product_id)
        label = ev_labels.get(event.event_type, 0)
        previous = positives.get(key)
        if previous is None:
            positives[key] = (event.occurred_at, label)
        else:
            positives[key] = (min(previous[0], event.occurred_at), max(previous[1], label))
    return {key: value for key, value in positives.items() if value[1] > 0}, touched


def assign_splits(positives: dict[tuple[str, str], tuple[datetime, int]]) -> list[Group]:
    """Temporal leave-last-out per user."""
    per_user: dict[str, list[tuple[datetime, str, int]]] = defaultdict(list)
    for (user_id, product_id), (ts, label) in positives.items():
        per_user[user_id].append((ts, product_id, label))
    groups: list[Group] = []
    for user_id in sorted(per_user):
        items = sorted(per_user[user_id])
        for rank, (ts, product_id, label) in enumerate(items):
            split = "train"
            if len(items) >= 3 and rank == len(items) - 1:
                split = "test"
            elif len(items) >= 3 and rank == len(items) - 2:
                split = "val"
            groups.append(Group(user_id, product_id, ts, label, split))
    return groups


def build(args: argparse.Namespace) -> Path:
    import app.ml.features as F

    started = time.monotonic()
    interactions: Path = args.interactions
    out_dir: Path = args.out_dir or interactions.parent / "dataset"
    df = read_interactions(interactions)
    catalog_df = resolve_catalog(interactions, args.catalog_source, args.catalog_url)
    catalog = to_products(catalog_df)
    catalog_order = catalog_df["product_id"].tolist()  # sku order

    in_catalog = df["product_id"].isin(set(catalog))
    n_dropped = int((~in_catalog).sum())
    if len(df) and n_dropped / len(df) > MAX_DROPPED_SHARE:
        fail(f"{n_dropped}/{len(df)} interactions are on products outside the catalog (> {MAX_DROPPED_SHARE:.0%})")
    df = df[in_catalog]
    events = [
        F.Event(user_id=u, product_id=p, event_type=t, occurred_at=ts.to_pydatetime())
        for u, p, t, ts in zip(df["user_id"], df["product_id"], df["event_type"], df["occurred_at"])
    ]

    positives, touched = positives_and_touched(events, F.EVENT_LABELS, F.apply_unlike_cancellation)
    groups = assign_splits(positives)
    # Global time order = the sweep order; group_id follows it.
    groups.sort(key=lambda g: (g.ts, g.user_id, g.product_id))

    # Products that may not be eval candidates: train/val positives + touched pairs without a row.
    excluded_eval: dict[str, set[str]] = defaultdict(set)
    for user_id, products in touched.items():
        excluded_eval[user_id] = {p for p in products if (user_id, p) not in positives}
    for group in groups:
        if group.split != "test":
            excluded_eval[group.user_id].add(group.product_id)

    user_events: dict[str, list] = defaultdict(list)
    for event in events:  # already time-ordered
        user_events[event.user_id].append(event)
    user_times = {u: [e.occurred_at for e in evs] for u, evs in user_events.items()}

    edges = F.price_band_edges(catalog)
    names = F.feature_names()
    rng = np.random.default_rng(args.seed)
    stats = F.ProductStats()
    out_rows: dict[str, dict[str, list]] = {
        name: {"user_id": [], "product_id": [], "group_id": [], "label": [], "ts": [], "x": []}
        for name in (*SPLITS, EVAL_CANDIDATES)
    }

    def add_row(split: str, group_id: int, group: Group, product_id: str, label: int, profile) -> None:
        product = catalog[product_id]
        product_features = F.build_product_features(product, stats.snapshot(product_id, group.ts), edges, group.ts)
        vector, _ = F.vectorize(profile, product_features, F.build_cross_features(profile, product))
        rows = out_rows[split]
        rows["user_id"].append(group.user_id)
        rows["product_id"].append(product_id)
        rows["group_id"].append(group_id)
        rows["label"].append(label)
        rows["ts"].append(group.ts)
        rows["x"].append(vector)

    cursor = 0
    for group_id, group in enumerate(groups):
        while cursor < len(events) and events[cursor].occurred_at < group.ts:
            stats.add(events[cursor])
            cursor += 1
        history = user_events[group.user_id][: bisect_left(user_times[group.user_id], group.ts)]
        profile = F.build_user_profile(history, catalog, group.ts)

        untouched = [p for p in catalog_order if p not in touched[group.user_id]]
        n_uniform = min(N_NEGATIVES // 2, len(untouched))
        uniform = [untouched[i] for i in rng.choice(len(untouched), size=n_uniform, replace=False)] if n_uniform else []
        chosen = set(uniform)
        rest = [p for p in untouched if p not in chosen]
        n_popular = min(N_NEGATIVES - n_uniform, len(rest))
        popular: list[str] = []
        if n_popular:
            weights = np.array([stats.snapshot(p, group.ts)[0] + POPULARITY_EPS for p in rest])
            popular = [rest[i] for i in rng.choice(len(rest), size=n_popular, replace=False, p=weights / weights.sum())]

        add_row(group.split, group_id, group, group.product_id, group.label, profile)
        for product_id in uniform + popular:
            add_row(group.split, group_id, group, product_id, 0, profile)

        if group.split == "test":
            blocked = excluded_eval[group.user_id]
            for product_id in catalog_order:
                if product_id == group.product_id:
                    add_row(EVAL_CANDIDATES, group_id, group, product_id, group.label, profile)
                elif product_id not in blocked:
                    add_row(EVAL_CANDIDATES, group_id, group, product_id, 0, profile)

    for name, rows in out_rows.items():
        matrix = np.vstack(rows["x"]) if rows["x"] else np.zeros((0, len(names)), dtype=np.float32)
        data: dict[str, pa.Array] = {
            "user_id": pa.array(rows["user_id"], pa.string()),
            "product_id": pa.array(rows["product_id"], pa.string()),
            "group_id": pa.array(rows["group_id"], pa.int64()),
            "label": pa.array(rows["label"], pa.int8()),
            "ts": pa.array(rows["ts"], pa.timestamp("us", tz="UTC")),
        }
        for j, feature in enumerate(names):
            data[feature] = pa.array(matrix[:, j], pa.float32())
        write_table(pa.table(data), out_dir / f"{name}.parquet")
        print(f"{name}: {len(rows['label'])} rows, {len(set(rows['group_id']))} groups")

    write_json(
        {
            "catalog_source": catalog_source_of(catalog_df),
            "feature_schema_version": F.FEATURE_SCHEMA_VERSION,
            "n_catalog_products": len(catalog),
            "n_dropped": n_dropped,
            "n_events_used": len(events),
            "n_negatives_per_positive": N_NEGATIVES,
            "price_band_edges": list(edges),
            "seed": args.seed,
        },
        out_dir / DATASET_META_JSON,
    )
    print(f"wrote {out_dir} in {time.monotonic() - started:.1f}s")
    return out_dir


def main() -> None:
    from recsys.dataset_card import write_card

    args = build_parser().parse_args()
    out_dir = build(args)
    write_card(args.interactions, out_dir, args.card_dir)


if __name__ == "__main__":
    main()
