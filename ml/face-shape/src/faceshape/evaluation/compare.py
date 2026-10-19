"""Step `make curated-compare`: deployed v2 vs curated runs v3 / v4 / v5 -> `compare.md` + `compare_f1.png`.

Plan 2026-10-18. Read-only: it loads each run's saved `metrics_<algo>.json` of its best model
(`select_best`, i.e. `training.selection`, never test numbers) and makes no new prediction. Runs:
v2-full-real-20261005 = dataset `data/datasets/full-real` (the deployed model's run), v3-curated-real-20261018 = curated real
images only, v4-curated-real-synth-20261018 = curated real + synthetic images,
v5-full-real-synth-20261019 = every old-train real image + synthetic images (`make curated-data` /
`make curated-train`). Writes into `reports/comparisons/20261019-curated-vs-current/`. Image counts per
label x split x origin come from each run's dataset (`data/datasets/<name>/`) `processed/splits.csv` +
`features.parquet` `source`.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from faceshape.common import DataPaths, build_parser, fail, parse, require_file
from faceshape.dataset.curated import origin_of
from faceshape.evaluation.evaluate import _fmt, _md_table, _predicted_counts
from faceshape.training.shared import ALGO_NAMES, select_best

# (name, dataset root, report dir) - fixed so the comparison always uses the same runs (v2 = deployed).
RUNS = (
    ("v2-full-real-20261005", Path("data/datasets/full-real"), Path("reports/runs/v2-full-real-20261005")),
    ("v3-curated-real-20261018", Path("data/datasets/curated-real"), Path("reports/runs/v3-curated-real-20261018")),
    ("v4-curated-real-synth-20261018", Path("data/datasets/curated-real-synth"), Path("reports/runs/v4-curated-real-synth-20261018")),
    ("v5-full-real-synth-20261019", Path("data/datasets/full-real-synth"), Path("reports/runs/v5-full-real-synth-20261019")),
)
RUN_COLORS = ("#9a9a96", "#2a78d6", "#eb6834", "#1f9e6e")
COUNT_COLUMNS = [(s, o) for s in ("train", "val", "test") for o in ("real", "synthetic")]


def _load_run(config: dict[str, Any], data_dir: Path, report_dir: Path) -> dict[str, Any]:
    import pandas as pd

    best = select_best(config, report_dir)
    metrics_path = report_dir / f"metrics_{best}.json"
    require_file(metrics_path, "Run `make evaluate` for this run first.")
    paths = DataPaths(data_dir)
    require_file(paths.splits_csv, "Run `make curated-data` first.")
    require_file(paths.features_parquet, "Run `make curated-data` first.")
    splits = pd.read_csv(paths.splits_csv, dtype=str)
    sources = pd.read_parquet(paths.features_parquet, columns=["image_id", "source"])
    df = splits.merge(sources, on="image_id", how="left", validate="one_to_one")
    if df["source"].isna().any():
        fail(f"{int(df['source'].isna().sum())} rows of {paths.splits_csv} have no features row.")
    df["origin"] = df["source"].map(origin_of)
    return {
        "best": best,
        "metrics": json.loads(metrics_path.read_text(encoding="utf-8")),
        "splits": df,
    }


def _counts_table(df: Any, classes: list[str]) -> str:
    rows = []
    for label in [*classes, "TOTAL"]:
        sub = df if label == "TOTAL" else df[df["label"] == label]
        cells = [str(int(((sub["split"] == s) & (sub["origin"] == o)).sum())) for s, o in COUNT_COLUMNS]
        rows.append([f"**{label}**" if label == "TOTAL" else label, *cells, str(len(sub))])
    return _md_table(["class", *(f"{s} {o}" for s, o in COUNT_COLUMNS), "total"], rows)


def _plot_f1(results: dict[str, dict[str, Any]], classes: list[str], out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    groups = [*classes, "macro-F1"]
    x = np.arange(len(groups))
    width = 0.8 / len(results)
    fig, ax = plt.subplots(figsize=(9, 4.4), facecolor="#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    for i, ((name, run), color) in enumerate(zip(results.items(), RUN_COLORS)):
        m = run["metrics"]
        values = [m["per_class"][c]["f1"] for c in classes] + [m["macro_f1"]]
        ax.bar(
            x + (i - (len(results) - 1) / 2) * width, values, width - 0.02,
            label=f"{name} ({ALGO_NAMES[run['best']]})", color=color, edgecolor="#fcfcfb", linewidth=1,
        )
    ax.set_xticks(x, groups)
    ax.set_ylim(0, 1)
    ax.set_ylabel("test F1")
    ax.set_title("Test F1 per class + macro-F1 (same old 701-image test split)", loc="left")
    ax.grid(axis="y", color="#e5e5e3", linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.legend(frameon=False, ncols=2, loc="upper left", bbox_to_anchor=(0, -0.08), fontsize=8)
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def _report(results: dict[str, dict[str, Any]], classes: list[str]) -> str:
    overall, per_class = [], []
    for name, run in results.items():
        m = run["metrics"]
        overall.append([
            name, ALGO_NAMES[run["best"]], _fmt(m["macro_f1"]), _fmt(m["accuracy"]), _fmt(m["per_class"]["DIAMOND"]["f1"]),
            str(_predicted_counts(m, classes)["DIAMOND"]), _fmt(m.get("test_brier"), 4),
        ])
        per_class.append([name, *(_fmt(m["per_class"][c]["f1"]) for c in classes), _fmt(m["macro_f1"])])
    first = next(iter(results.values()))["metrics"]
    support = {c: first["per_class"][c]["support"] for c in classes}
    counts = []
    for name, run in results.items():
        counts += [f"### {name}", "", _counts_table(run["splits"], classes), ""]
    lines = [
        "# Face-shape classifiers - curated dataset comparison (plan 2026-10-18)",
        "",
        f"Generated {date.today().isoformat()} by `make curated-compare` from the saved `metrics_<algo>.json` "
        "of each run (no new test prediction). Do not edit by hand.",
        "",
        "Runs (best model of each run by CV macro-F1, `training.selection` - not by test numbers):",
        "",
        *(f"- **{name}**: data `{data}`, reports `{reports}`" for name, data, reports in RUNS),
        "",
        "## Overall (test)",
        "",
        _md_table(["run", "best model", "macro F1", "accuracy", "DIAMOND F1",
                   f"DIAMOND predicted (true n={support['DIAMOND']})", "test Brier"], overall),
        "",
        "## F1 per class (test)",
        "",
        _md_table(["run", *(f"{c} (n={support[c]})" for c in classes), "macro F1"], per_class),
        "",
        "![Test F1 per class](compare_f1.png)",
        "",
        "## Caveats",
        "",
        f"- All runs are scored on the same old test split ({first['n_test']} real images, identity-disjoint "
        "from train/val). Val is the same old val split too; synthetic images are only in train.",
        "- This is a repeated test pass (the third or later read of this test split, after v1-full-real-20260930-svm "
        "and the deployed v2-full-real-20261005-svm). The `summary.md` of each curated run (v3-v5) keeps the stock "
        "\"predicted exactly once\" wording, which is per run only. Do not use these numbers to tune or pick settings.",
        f"- DIAMOND has only {support['DIAMOND']} test images, so its F1 has a wide margin of error.",
        "- v4 and v5 pick their model by grouped CV on train+val, and those folds also score the synthetic images, "
        "so their CV macro-F1 (in each run's `summary.md`) is higher than on real images only. Compare runs on test.",
        "- Synthetic train images change the class mix the model learns (see the counts below), so read the "
        "DIAMOND predicted count next to DIAMOND F1.",
        "- Synthetic images skip the near-duplicate dedup (only the exact-duplicate SHA-1 check runs) and are not "
        "checked for near-duplicates against the real images.",
        "",
        "## Images per class, split and origin",
        "",
        *counts,
    ]
    return "\n".join(lines)


def main() -> None:
    parser = build_parser("Compare the deployed v2 run with the curated runs v3 / v4 / v5 (saved test metrics only).")
    parser.add_argument(
        "--out-dir", type=Path, default=Path("reports/comparisons/20261019-curated-vs-current"),
        help="report folder (default: reports/comparisons/20261019-curated-vs-current)",
    )
    args, config, _ = parse(parser)
    classes: list[str] = config["classes"]

    results = {name: _load_run(config, data, reports) for name, data, reports in RUNS}
    test_ids = {name: set(run["splits"].loc[run["splits"]["split"] == "test", "image_id"]) for name, run in results.items()}
    reference = next(iter(test_ids.values()))
    if any(ids != reference for ids in test_ids.values()):
        fail("The runs do not share the same test split - re-run `make curated-data`.")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    _plot_f1(results, classes, args.out_dir / "compare_f1.png")
    out = args.out_dir / "compare.md"
    out.write_text(_report(results, classes), encoding="utf-8")
    for name, run in results.items():
        print(f"{name}: {ALGO_NAMES[run['best']]} macro-F1 {run['metrics']['macro_f1']:.4f}.")
    print(f"Wrote {out} and {args.out_dir / 'compare_f1.png'}.")


if __name__ == "__main__":
    main()
