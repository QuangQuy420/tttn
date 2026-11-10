"""Step `make card`: dataset card of the recommendation dataset (plan 09, T7).

Reads the interactions file, `run_meta.json` / `personas.parquet` beside it (simulator only),
and the dataset folder (`dataset_meta.json` + split parquets), then writes
`dataset_card.md` + `dataset_card.json` to `--card-dir` (default `reports/`, committed; smoke
runs pass a folder under `data/`). Reports users / products / events by type, the funnel
(AC4, warning when not strictly decreasing), events per user, sparsity
`1 - n_pairs / (n_users * n_catalog_products)`, the gamma histogram and shares (AC3, warning when
< 5% below 0.15 or above 0.85; "n/a" for real data), rows / groups / labels per split, and
`FEATURE_SCHEMA_VERSION` (AC13). No timestamps of the run itself, so the same data gives the
same card.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

from recsys.common import DATASET_META_JSON, PERSONAS_PARQUET, RUN_META_JSON, fail, read_interactions, read_json, write_json

EVENT_TYPES = ("VIEW", "TRY_ON", "LIKE", "UNLIKE", "ADD_TO_CART", "PURCHASE")
FUNNEL = ("VIEW", "TRY_ON", "LIKE", "ADD_TO_CART", "PURCHASE")
SPLIT_FILES = ("train", "val", "test", "eval_candidates")
GAMMA_LOW, GAMMA_HIGH, GAMMA_MIN_SHARE = 0.15, 0.85, 0.05
GAMMA_BINS = 10


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--interactions", type=Path, default=Path("data/sim/interactions.parquet"))
    parser.add_argument("--dataset-dir", type=Path, default=None, help="default: <interactions folder>/dataset/")
    parser.add_argument("--card-dir", type=Path, default=Path("reports"))
    return parser


def _round(value: float, digits: int = 4) -> float:
    return float(round(float(value), digits))


def interaction_stats(df: pd.DataFrame, n_catalog: int) -> dict[str, Any]:
    by_type = {t: int((df["event_type"] == t).sum()) for t in EVENT_TYPES}
    funnel_counts = [by_type[t] for t in FUNNEL]
    per_user = df.groupby("user_id").size()
    n_users = int(df["user_id"].nunique())
    n_pairs = int(df[["user_id", "product_id"]].drop_duplicates().shape[0])
    return {
        "n_events": int(len(df)),
        "n_users": n_users,
        "n_products_interacted": int(df["product_id"].nunique()),
        "n_pairs": n_pairs,
        "sparsity": _round(1.0 - n_pairs / (n_users * n_catalog)) if n_users and n_catalog else None,
        "events_by_type": by_type,
        "events_by_source": {k: int(v) for k, v in df["source"].value_counts().sort_index().items()},
        "events_per_user": {
            "mean": _round(per_user.mean(), 2) if n_users else 0.0,
            "median": _round(per_user.median(), 2) if n_users else 0.0,
            "p10": _round(per_user.quantile(0.1), 2) if n_users else 0.0,
            "p90": _round(per_user.quantile(0.9), 2) if n_users else 0.0,
        },
        "funnel": {
            "counts": dict(zip(FUNNEL, funnel_counts)),
            "step_ratio": {
                f"{FUNNEL[i]}/{FUNNEL[i - 1]}": _round(funnel_counts[i] / funnel_counts[i - 1]) if funnel_counts[i - 1] else None
                for i in range(1, len(FUNNEL))
            },
            "strictly_decreasing": all(a > b for a, b in zip(funnel_counts, funnel_counts[1:])),
        },
        "time_range": [df["occurred_at"].min().isoformat(), df["occurred_at"].max().isoformat()] if len(df) else None,
    }


def persona_stats(personas_path: Path) -> dict[str, Any] | None:
    if not personas_path.is_file():
        return None
    personas = pq.read_table(personas_path).to_pandas()
    gamma = personas["gamma"].to_numpy()
    counts, edges = np.histogram(gamma, bins=GAMMA_BINS, range=(0.0, 1.0))
    low, high = float(np.mean(gamma < GAMMA_LOW)), float(np.mean(gamma > GAMMA_HIGH))
    return {
        "n_personas": int(len(personas)),
        "gamma_share_below_0_15": _round(low),
        "gamma_share_above_0_85": _round(high),
        "gamma_shares_ok": low >= GAMMA_MIN_SHARE and high >= GAMMA_MIN_SHARE,
        "gamma_histogram": [
            {"bin": f"[{edges[i]:.1f}, {edges[i + 1]:.1f}{']' if i == GAMMA_BINS - 1 else ')'}", "count": int(c)}
            for i, c in enumerate(counts)
        ],
        "face_shape_shares": {k: _round(v) for k, v in personas["face_shape"].value_counts(normalize=True).sort_index().items()},
        "gender_shares": {k: _round(v) for k, v in personas["gender"].value_counts(normalize=True).sort_index().items()},
        "drifted_share": _round(personas["drifted"].mean()),
    }


def split_stats(dataset_dir: Path) -> tuple[dict[str, Any], list[str]]:
    stats: dict[str, Any] = {}
    feature_columns: list[str] = []
    for name in SPLIT_FILES:
        path = dataset_dir / f"{name}.parquet"
        if not path.is_file():
            fail(f"{path} not found - run build_dataset first")
        df = pq.read_table(path).to_pandas()
        feature_columns = [c for c in df.columns if c not in ("user_id", "product_id", "group_id", "label", "ts")]
        positives = (df["label"] > 0).groupby(df["group_id"]).sum()
        negatives = (df["label"] == 0).groupby(df["group_id"]).sum()
        stats[name] = {
            "rows": int(len(df)),
            "groups": int(df["group_id"].nunique()),
            "users": int(df["user_id"].nunique()),
            "labels": {str(k): int(v) for k, v in df["label"].value_counts().sort_index().items()},
            "negatives_per_group": {
                "min": int(negatives.min()) if len(df) else 0,
                "mean": _round(negatives.mean(), 2) if len(df) else 0.0,
                "max": int(negatives.max()) if len(df) else 0,
            },
            "positives_per_group": [int(positives.min()), int(positives.max())] if len(df) else [0, 0],
        }
    return stats, feature_columns


def collect(interactions: Path, dataset_dir: Path) -> dict[str, Any]:
    from app.ml.features import FEATURE_SCHEMA_VERSION, feature_names

    meta = read_json(dataset_dir / DATASET_META_JSON)
    if meta is None:
        fail(f"{dataset_dir / DATASET_META_JSON} not found - run build_dataset first")
    df = read_interactions(interactions)
    splits, feature_columns = split_stats(dataset_dir)
    card: dict[str, Any] = {
        "interactions": str(interactions),
        "dataset_dir": str(dataset_dir),
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "n_features": len(feature_columns),
        "features_match_schema": feature_columns == feature_names(),
        "feature_names_containing_face": [c for c in feature_columns if "face" in c.lower()],
        "dataset_meta": meta,
        "run_meta": read_json(interactions.parent / RUN_META_JSON),
        "interactions_stats": interaction_stats(df, int(meta["n_catalog_products"])),
        "personas": persona_stats(interactions.parent / PERSONAS_PARQUET),
        "splits": splits,
    }
    warnings = []
    if not card["interactions_stats"]["funnel"]["strictly_decreasing"]:
        warnings.append("funnel is not strictly decreasing VIEW > TRY_ON > LIKE > ADD_TO_CART > PURCHASE (AC4)")
    if card["personas"] is not None and not card["personas"]["gamma_shares_ok"]:
        warnings.append(f"gamma share below {GAMMA_LOW} or above {GAMMA_HIGH} is under {GAMMA_MIN_SHARE:.0%} (AC3)")
    if card["feature_names_containing_face"]:
        warnings.append("a feature name contains 'face' (AC12)")
    if not card["features_match_schema"]:
        warnings.append("feature columns differ from app.ml.features.feature_names()")
    card["warnings"] = warnings
    return card


def _table(header: list[str], rows: list[list[Any]]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines += ["| " + " | ".join(str(cell) for cell in row) + " |" for row in rows]
    return lines


def render_markdown(card: dict[str, Any]) -> str:
    s, meta = card["interactions_stats"], card["dataset_meta"]
    lines = [
        "# Recommendation dataset card (plan 09)",
        "",
        f"Generated by `python -m recsys.dataset_card` from `{card['interactions']}` and `{card['dataset_dir']}/`.",
        "",
    ]
    if card["warnings"]:
        lines += [f"> WARNING: {w}" for w in card["warnings"]] + [""]
    run_meta = card["run_meta"]
    source = (
        f"simulator (seed {run_meta['seed']}, {run_meta['users']} users, {run_meta['days']} days from {run_meta['start_date']})"
        if run_meta
        else "real export (recommendation_db)"
    )
    lines += [
        "## Summary",
        "",
        *_table(
            ["item", "value"],
            [
                ["source", source],
                ["catalog source", meta["catalog_source"]],
                ["FEATURE_SCHEMA_VERSION", f"`{card['feature_schema_version']}`"],
                ["features", f"{card['n_features']} (match `feature_names()`: {card['features_match_schema']})"],
                ["feature names containing 'face'", len(card["feature_names_containing_face"])],
                ["events", s["n_events"]],
                ["users with events", s["n_users"]],
                ["catalog products", meta["n_catalog_products"]],
                ["products with events", s["n_products_interacted"]],
                ["events dropped (product not in catalog)", meta["n_dropped"]],
                ["distinct (user, product) pairs", s["n_pairs"]],
                ["sparsity", s["sparsity"]],
                [
                    "events per user (mean / median / p10 / p90)",
                    " / ".join(str(s["events_per_user"][k]) for k in ("mean", "median", "p10", "p90")),
                ],
                ["time range", " .. ".join(s["time_range"]) if s["time_range"] else "-"],
                ["negative sampling seed", meta["seed"]],
                ["price band edges", ", ".join(f"{edge:,.0f}" for edge in meta["price_band_edges"])],
            ],
        ),
        "",
        "## Events by type",
        "",
        *_table(["event_type", "count"], [[t, n] for t, n in s["events_by_type"].items()]),
        "",
        "## Funnel (AC4)",
        "",
        f"Strictly decreasing VIEW > TRY_ON > LIKE > ADD_TO_CART > PURCHASE: **{s['funnel']['strictly_decreasing']}**",
        "",
        *_table(["step", "ratio"], [[k, v] for k, v in s["funnel"]["step_ratio"].items()]),
        "",
        "## Personas and face-fit sensitivity gamma (AC3)",
        "",
    ]
    personas = card["personas"]
    if personas is None:
        lines += ["n/a (real exported data has no personas)", ""]
    else:
        lines += [
            f"{personas['n_personas']} personas. gamma < {GAMMA_LOW}: **{personas['gamma_share_below_0_15']:.1%}**, "
            f"gamma > {GAMMA_HIGH}: **{personas['gamma_share_above_0_85']:.1%}** "
            f"(each must be >= {GAMMA_MIN_SHARE:.0%}: {personas['gamma_shares_ok']}). "
            f"Drifted users: {personas['drifted_share']:.1%}.",
            "",
            *_table(["gamma bin", "users"], [[b["bin"], b["count"]] for b in personas["gamma_histogram"]]),
            "",
            "Face shape shares (generation only - never a feature): "
            + ", ".join(f"{k} {v:.1%}" for k, v in personas["face_shape_shares"].items()),
            "",
            "Gender shares: " + ", ".join(f"{k} {v:.1%}" for k, v in personas["gender_shares"].items()),
            "",
        ]
    rows = []
    for name, split in card["splits"].items():
        labels = ", ".join(f"{k}: {v}" for k, v in split["labels"].items())
        neg = split["negatives_per_group"]
        rows.append([name, split["rows"], split["groups"], split["users"], labels, f"{neg['min']} / {neg['mean']} / {neg['max']}"])
    lines += [
        "## Splits",
        "",
        "Temporal leave-last-out per user (AC10); 20 negatives per positive (AC9); labels per roadmap C4 (AC8).",
        "`eval_candidates` = every catalog product per test user, except that user's train/val positives.",
        "",
        *_table(["split", "rows", "groups", "users", "labels (label: rows)", "negatives per group (min / mean / max)"], rows),
        "",
    ]
    return "\n".join(lines)


def write_card(interactions: Path, dataset_dir: Path, card_dir: Path) -> dict[str, Any]:
    card = collect(interactions, dataset_dir)
    card_dir.mkdir(parents=True, exist_ok=True)
    write_json(card, card_dir / "dataset_card.json")
    (card_dir / "dataset_card.md").write_text(render_markdown(card), encoding="utf-8")
    for warning in card["warnings"]:
        print(f"warning: {warning}")
    print(f"wrote {card_dir / 'dataset_card.md'} and {card_dir / 'dataset_card.json'}")
    return card


def main() -> None:
    args = build_parser().parse_args()
    write_card(args.interactions, args.dataset_dir or args.interactions.parent / "dataset", args.card_dir)


if __name__ == "__main__":
    main()
