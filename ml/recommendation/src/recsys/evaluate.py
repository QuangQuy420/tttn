"""Step `make evaluate`: full-ranking test of the frozen models and baselines (plan 10, T5).

Loads `val_results.json` + the models of `--models-dir` (written by `recsys.train`; nothing is
fitted or tuned here) and scores:

- Full ranking (Krichene & Rendle, KDD 2020): per test user, every product in their
  `eval_candidates` block (the catalog minus their train/val positives), ties by `product_id`.
  `R_u` = the held-out test product (label >= 1); every test user counts. P/R/HR/NDCG @5 and @10,
  95% CI from 1000 user bootstrap resamples (fixed `--seed`), catalog coverage@10 and the mean
  `p_price` of the top 10.
- `tryon_plus`: same metrics on the users whose test label >= 2; `ablation`: the best binary
  family trained with `label >= 1 / 2 / 3`.
- Calibration: Brier score + 10-bin reliability diagram on the val and test rows (1:20 sampled
  negatives, target = the model's own label threshold; the ranker uses `label >= 2`).
- Feature importance of the best model: permutation importance on val (callable scorer = mean
  val-group NDCG@10 over `preference.raw_score`), plus XGBoost gain.

Writes `reports/preference_results.{md,csv,json}` and
`reports/figures/{metrics_bar,reliability,feature_importance}.png`.
"""
from __future__ import annotations

import argparse
import csv
import math
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.ml import features, preference
from recsys import baselines, metrics
from recsys.common import DATASET_META_JSON, RUN_META_JSON, fail, read_json, write_json
from recsys.train import MODEL_FILE, PRIMARY_LABEL_MIN, VAL_RESULTS_JSON, feature_matrix, load_split

RESULTS_STEM = "preference_results"
TOP_K = 10
N_BOOTSTRAP = 1000
N_BINS = 10
N_REPEATS = 5
TOP_FEATURES = 20
# Categorical slots 1-4 (fixed order) of the dataviz reference palette, light surface.
SERIES_COLORS = ("#2a78d6", "#eb6834", "#1baf7a", "#eda100")
INK, MUTED = "#1f1f1e", "#6b6a64"
NAMES = {
    "popularity": "Popularity",
    "content": "Content-based",
    "als": "ALS (implicit)",
    "lr": "Logistic Regression",
    "rf": "Random Forest",
    "xgb": "XGBoost binary",
    "xgbrank": "XGBoost ranker",
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset-dir", type=Path, default=Path("data/sim/dataset"))
    parser.add_argument("--models-dir", type=Path, default=Path("data/models"))
    parser.add_argument("--reports-dir", type=Path, default=Path("reports"))
    parser.add_argument("--seed", type=int, default=42, help="bootstrap / permutation seed")
    return parser


def display_name(name: str) -> str:
    if name in NAMES:
        return NAMES[name]
    family, _, threshold = name.rpartition("_ge")
    return f"{NAMES.get(family, family)} (label >= {threshold})"


def label_min_of(entry: dict[str, Any]) -> int:
    definition = entry.get("label_definition") or ""
    return int(definition.split(">=")[1]) if ">=" in definition else PRIMARY_LABEL_MIN


class Scorer:
    """Score function per model name; models are loaded once from `--models-dir`."""

    def __init__(self, models_dir: Path, results: dict[str, dict[str, Any]]) -> None:
        import joblib

        self.results = results
        self.models: dict[str, Any] = {}
        for name, entry in results.items():
            if name in baselines.BASELINES:
                continue
            path = models_dir / name / MODEL_FILE
            if not path.is_file():
                fail(f"{path} not found - run `make train` first")
            self.models[name] = joblib.load(path)

    def raw(self, name: str, frame: pd.DataFrame, X: np.ndarray) -> np.ndarray:
        if name in baselines.BASELINES:
            return baselines.BASELINES[name](frame)
        if name == "als":
            return self.models[name].score(frame)
        return preference.raw_score(self.models[name], self.results[name]["calibration"]["raw_score"], X)

    def preference(self, name: str, frame: pd.DataFrame, X: np.ndarray) -> np.ndarray:
        return preference.predict_preference(self.models[name], self.results[name]["calibration"], X)


def ranking_table(frame: pd.DataFrame, scores: np.ndarray, users: np.ndarray | None, seed: int, n_catalog: int) -> dict[str, Any]:
    """Bootstrap metrics (+ mean price of the top 10, coverage@10) on the groups in `users` (None = all)."""
    groups = frame["group_id"].to_numpy()
    product_ids = frame["product_id"].to_numpy()
    per_user = metrics.per_user_metrics(groups, frame["label"].to_numpy(), scores, product_ids)
    top = metrics.top_k(groups, scores, product_ids, TOP_K)
    top["price"] = frame["p_price"].to_numpy(dtype=np.float64)[top["row"].to_numpy()]
    per_user[f"mean_price@{TOP_K}"] = top.groupby("group_id")["price"].mean().reindex(per_user.index)
    if users is not None:
        per_user = per_user[per_user.index.isin(users)]
        top = top[top["group_id"].isin(users)]
    table = metrics.bootstrap_ci(per_user, N_BOOTSTRAP, seed)
    table[f"coverage@{TOP_K}"] = {"mean": float(top["product_id"].nunique() / n_catalog), "ci_low": None, "ci_high": None}
    table["n_users"] = {"mean": float(len(per_user)), "ci_low": None, "ci_high": None}
    return table


def reliability(probabilities: np.ndarray, target: np.ndarray) -> dict[str, Any]:
    """10 equal-width bins: mean predicted vs observed positive rate, plus the Brier score."""
    bins = np.minimum((probabilities * N_BINS).astype(int), N_BINS - 1)
    rows = []
    for b in range(N_BINS):
        mask = bins == b
        if mask.any():
            rows.append({"bin": b, "n": int(mask.sum()), "mean_pred": float(probabilities[mask].mean()), "observed": float(target[mask].mean())})
    return {"brier": float(np.mean((probabilities - target) ** 2)), "bins": rows}


def feature_importance(scorer: Scorer, best: str, val: pd.DataFrame, X_val: np.ndarray, seed: int) -> list[dict[str, Any]]:
    from sklearn.inspection import permutation_importance

    model = scorer.models[best]
    kind = scorer.results[best]["calibration"]["raw_score"]
    groups = val["group_id"].to_numpy()
    product_ids = val["product_id"].to_numpy()

    def ndcg_scorer(estimator: Any, X: np.ndarray, y: np.ndarray) -> float:
        return metrics.mean_group_ndcg(groups, y, preference.raw_score(estimator, kind, X), product_ids, k=TOP_K)

    result = permutation_importance(
        model, X_val, val["label"].to_numpy(), scoring=ndcg_scorer, n_repeats=N_REPEATS, random_state=seed, n_jobs=1
    )
    gain: dict[str, float] = {}
    if hasattr(model, "get_booster"):
        gain = model.get_booster().get_score(importance_type="gain")
    names = features.feature_names()
    rows = [
        {
            "feature": name,
            "importance_mean": float(result.importances_mean[j]),
            "importance_std": float(result.importances_std[j]),
            "xgb_gain": float(gain.get(f"f{j}", 0.0)) if gain else None,
        }
        for j, name in enumerate(names)
    ]
    return sorted(rows, key=lambda row: (-row["importance_mean"], row["feature"]))


def _fmt(cell: dict[str, Any] | None, digits: int = 4) -> str:
    if cell is None or cell["mean"] is None or (isinstance(cell["mean"], float) and math.isnan(cell["mean"])):
        return "n/a"
    if cell["ci_low"] is None:
        return f"{cell['mean']:.{digits}f}"
    return f"{cell['mean']:.{digits}f} [{cell['ci_low']:.{digits}f}, {cell['ci_high']:.{digits}f}]"


def markdown_table(tables: dict[str, dict[str, Any]], columns: list[str]) -> list[str]:
    lines = ["| model | " + " | ".join(columns) + " |", "|---|" + "---|" * len(columns)]
    for name, table in tables.items():
        cells = []
        for column in columns:
            if column == f"mean_price@{TOP_K}":
                cells.append(f"{table[column]['mean']:,.0f}" if table[column]["mean"] == table[column]["mean"] else "n/a")
            elif column == "n_users":
                cells.append(f"{int(table[column]['mean'])}")
            else:
                cells.append(_fmt(table.get(column)))
        lines.append(f"| {display_name(name)} | " + " | ".join(cells) + " |")
    return lines


def write_csv(report: dict[str, Any], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["table", "model", "metric", "mean", "ci_low", "ci_high"])
        for table_name in ("all_users", "tryon_plus", "ablation"):
            for name, table in report[table_name].items():
                for metric, cell in table.items():
                    writer.writerow(
                        [table_name, name, metric]
                        + ["" if cell[key] is None else f"{cell[key]:.6f}" for key in ("mean", "ci_low", "ci_high")]
                    )
        for name, entry in report["calibration"].items():
            for split in ("val", "test"):
                writer.writerow(["calibration", name, f"brier_{split}", f"{entry[split]['brier']:.6f}", "", ""])


def plot_figures(report: dict[str, Any], best: str, figures_dir: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figures_dir.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED, "ytick.color": MUTED, "font.size": 9})

    # Small multiples: one panel per metric (one axis each), bars = models with the 95% CI.
    tables = report["all_users"]
    names = list(tables)
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2), sharey=False)
    for ax, metric in zip(axes, (f"ndcg@{TOP_K}", f"hitrate@{TOP_K}")):
        means = np.array([tables[n][metric]["mean"] for n in names])
        errors = np.array([[m - tables[n][metric]["ci_low"], tables[n][metric]["ci_high"] - m] for n, m in zip(names, means)]).T
        ax.bar(range(len(names)), means, yerr=errors, color=SERIES_COLORS[0], width=0.7, capsize=3, ecolor=INK, error_kw={"linewidth": 1})
        ax.set_xticks(range(len(names)), [display_name(n) for n in names], rotation=30, ha="right")
        ax.set_title(f"{metric} (test, all users, 95% CI)", color=INK)
        ax.grid(axis="y", color="#e4e3dd", linewidth=0.8)
        ax.set_axisbelow(True)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
    fig.suptitle("Full-ranking test metrics - simulated data", color=INK)
    fig.tight_layout()
    fig.savefig(figures_dir / "metrics_bar.png", dpi=150)
    plt.close(fig)

    # Reliability: one panel per split, one line per primary model (legend + fixed colour order).
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.4), sharey=True)
    primaries = [n for n in report["calibration"] if report["models"][n]["primary"]]
    for ax, split in zip(axes, ("val", "test")):
        ax.plot([0, 1], [0, 1], color=MUTED, linewidth=1, linestyle="--", label="perfect")
        for color, name in zip(SERIES_COLORS, primaries):
            entry = report["calibration"][name][split]
            xs = [row["mean_pred"] for row in entry["bins"]]
            ys = [row["observed"] for row in entry["bins"]]
            ax.plot(xs, ys, color=color, linewidth=2, marker="o", markersize=5, label=f"{display_name(name)} (Brier {entry['brier']:.4f})")
        ax.set_title(f"Reliability on {split} rows (1:20 sampled negatives)", color=INK)
        ax.set_xlabel("mean PreferenceScore in bin")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.grid(color="#e4e3dd", linewidth=0.8)
        ax.legend(loc="upper left", fontsize=7, frameon=False)
    axes[0].set_ylabel("observed share with label >= 2")
    fig.tight_layout()
    fig.savefig(figures_dir / "reliability.png", dpi=150)
    plt.close(fig)

    rows = report["feature_importance"]["rows"][:TOP_FEATURES][::-1]
    fig, ax = plt.subplots(figsize=(7, 6))
    ax.barh(
        [row["feature"] for row in rows],
        [row["importance_mean"] for row in rows],
        xerr=[row["importance_std"] for row in rows],
        color=SERIES_COLORS[0],
        ecolor=INK,
        capsize=2,
        error_kw={"linewidth": 1},
    )
    ax.set_xlabel(f"drop in val NDCG@{TOP_K} when the feature is permuted")
    ax.set_title(f"Permutation importance - {display_name(best)} (top {TOP_FEATURES})", color=INK)
    ax.grid(axis="x", color="#e4e3dd", linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    fig.tight_layout()
    fig.savefig(figures_dir / "feature_importance.png", dpi=150)
    plt.close(fig)


def write_markdown(report: dict[str, Any], path: Path) -> None:
    data_kind = report["data"]
    best = report["best"]
    k_cols = metrics.metric_names() + [f"coverage@{TOP_K}", f"mean_price@{TOP_K}", "n_users"]
    lines = [
        f"# PreferenceScore results (plan 10) - {data_kind} data",
        "",
        f"Generated by `python -m recsys.evaluate` from `{report['dataset_dir']}` (catalog `{report['catalog_source']}`, "
        f"{report['n_catalog_products']} products, train seed {report['seed']}). **All numbers are on {data_kind} data.**",
        "",
        "## Protocol",
        "",
        "- Test = full ranking: per test user, every catalog product they have not interacted with in train/val "
        "(`eval_candidates`), ties broken by `product_id`. `R_u` = the held-out last product (label >= 1); every test user is included. No sampled metric.",
        "- Each user has exactly one held-out product (`|R_u| = 1`), so **Recall@K = HitRate@K** and "
        "**Precision@K = HitRate@K / K**; the graded gain cancels in NDCG.",
        f"- 95% CI = percentile interval of {N_BOOTSTRAP} bootstrap resamples of users (seed {report['seed']}). "
        f"`coverage@{TOP_K}` = share of the catalog in at least one top-{TOP_K} (no CI); `mean_price@{TOP_K}` = mean `p_price` of the top {TOP_K}.",
        "- Hyperparameters, the best model and the calibration were chosen on **val** only, with the **sampled** val-group NDCG@10 "
        "(1 positive + 20 negatives). That number is optimistic and used only for selection; the test numbers below are the final ones and were used for nothing.",
        "- Popularity is pushed down on val because half of the val negatives are popularity-sampled.",
        "- PreferenceScore = sigmoid (Platt) of the raw model score, fitted on val. Its probabilities are relative to the "
        "sampled 1:20 negative ratio, not the real prevalence. No feature comes from the face-shape model.",
        "",
        f"Best model (highest val NDCG@10 among LR / RF / XGBoost binary / XGBoost ranker): **{display_name(best)}**.",
        "",
        "## Validation NDCG@10 (sampled, selection only)",
        "",
        "| model | val NDCG@10 | role | label | params |",
        "|---|---|---|---|---|",
    ]
    for name, entry in report["models"].items():
        role = "primary" if entry["primary"] else ("ablation" if "_ge" in name else "baseline")
        params = ", ".join(f"{k}={v}" for k, v in entry["params"].items()) or "-"
        lines.append(f"| {display_name(name)} | {entry['val_ndcg@10']:.4f} | {role} | {entry['label_definition'] or '-'} | {params} |")
    lines += ["", "## Test - all users (full ranking)", ""] + markdown_table(report["all_users"], k_cols)
    lines += ["", "## Test - users whose held-out product is Try-on or higher (label >= 2)", ""]
    lines += markdown_table(report["tryon_plus"], k_cols)
    lines += ["", f"## Ablation - binary label threshold ({display_name(report['ablation_family'])}, test, all users)", ""]
    lines += markdown_table(report["ablation"], k_cols)
    lines += [
        "",
        "## Calibration (Brier score, val / test rows with 1:20 sampled negatives)",
        "",
        "| model | target | Brier val | Brier test | a | b |",
        "|---|---|---|---|---|---|",
    ]
    for name, entry in report["calibration"].items():
        cal = report["models"][name]["calibration"]
        lines.append(
            f"| {display_name(name)} | label >= {entry['label_min']} | {entry['val']['brier']:.4f} | {entry['test']['brier']:.4f} | {cal['a']:.4f} | {cal['b']:.4f} |"
        )
    importance = report["feature_importance"]
    lines += [
        "",
        f"## Feature importance - {display_name(best)} (permutation on val, NDCG@10, {N_REPEATS} repeats)",
        "",
        "| feature | importance (mean ± std) | XGBoost gain |",
        "|---|---|---|",
    ]
    for row in importance["rows"][:TOP_FEATURES]:
        gain = "-" if row["xgb_gain"] is None else f"{row['xgb_gain']:.2f}"
        lines.append(f"| `{row['feature']}` | {row['importance_mean']:.4f} ± {row['importance_std']:.4f} | {gain} |")
    lines += [
        "",
        "## Figures",
        "",
        "- `figures/metrics_bar.png` - test NDCG@10 / HitRate@10 with the 95% CI",
        "- `figures/reliability.png` - reliability diagrams (10 bins), val and test",
        "- `figures/feature_importance.png` - permutation importance of the best model",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = build_parser().parse_args()
    started = time.monotonic()
    val_results = read_json(args.models_dir / VAL_RESULTS_JSON)
    if val_results is None:
        fail(f"{args.models_dir / VAL_RESULTS_JSON} not found - run `make train` first")
    # Report order: baselines, ALS, primary models, ablations (val_results.json is key-sorted).
    order = [*baselines.BASELINES, "als", "lr", "rf", "xgb", "xgbrank"]
    results: dict[str, dict[str, Any]] = dict(
        sorted(val_results["models"].items(), key=lambda item: (order.index(item[0]) if item[0] in order else len(order), item[0]))
    )
    best = val_results["best"]
    meta = read_json(args.dataset_dir / DATASET_META_JSON) or {}
    n_catalog = int(meta["n_catalog_products"])
    data_kind = "simulated" if (args.dataset_dir.parent / RUN_META_JSON).is_file() else "real"

    val = load_split(args.dataset_dir, "val")
    test = load_split(args.dataset_dir, "test")
    candidates = load_split(args.dataset_dir, "eval_candidates")
    X_val, X_test, X_cand = feature_matrix(val), feature_matrix(test), feature_matrix(candidates)
    scorer = Scorer(args.models_dir, results)

    test_label = candidates.loc[candidates["label"] > 0].groupby("group_id")["label"].max()
    tryon_users = test_label[test_label >= PRIMARY_LABEL_MIN].index.to_numpy()

    ablation_names = [name for name in results if "_ge" in name]
    ablation_family = ablation_names[0].rpartition("_ge")[0] if ablation_names else None
    report: dict[str, Any] = {
        "data": data_kind,
        "dataset_dir": str(args.dataset_dir),
        "catalog_source": meta.get("catalog_source"),
        "n_catalog_products": n_catalog,
        "seed": args.seed,
        "best": best,
        "ablation_family": ablation_family,
        "models": results,
        "all_users": {},
        "tryon_plus": {},
        "ablation": {},
        "calibration": {},
    }
    for name, entry in results.items():
        scores = scorer.raw(name, candidates, X_cand)
        if name in ablation_names:
            report["ablation"][name] = ranking_table(candidates, scores, None, args.seed, n_catalog)
        else:
            report["all_users"][name] = ranking_table(candidates, scores, None, args.seed, n_catalog)
            report["tryon_plus"][name] = ranking_table(candidates, scores, tryon_users, args.seed, n_catalog)
        if entry["calibration"] is not None:
            label_min = label_min_of(entry)
            report["calibration"][name] = {
                "label_min": label_min,
                "val": reliability(scorer.preference(name, val, X_val), (val["label"].to_numpy() >= label_min).astype(np.float64)),
                "test": reliability(scorer.preference(name, test, X_test), (test["label"].to_numpy() >= label_min).astype(np.float64)),
            }
        print(f"{name}: test NDCG@10 = {(report['ablation'] if name in ablation_names else report['all_users'])[name]['ndcg@10']['mean']:.4f}")
    if ablation_family is not None:
        ordered = {f"{ablation_family}_ge1": None, ablation_family: None, f"{ablation_family}_ge3": None}
        report["ablation"] = {
            name: (report["all_users"][name] if name == ablation_family else report["ablation"][name]) for name in ordered
        }

    report["feature_importance"] = {"model": best, "rows": feature_importance(scorer, best, val, X_val, args.seed)}

    args.reports_dir.mkdir(parents=True, exist_ok=True)
    write_json(report, args.reports_dir / f"{RESULTS_STEM}.json")
    write_csv(report, args.reports_dir / f"{RESULTS_STEM}.csv")
    write_markdown(report, args.reports_dir / f"{RESULTS_STEM}.md")
    plot_figures(report, best, args.reports_dir / "figures")
    print(f"wrote {args.reports_dir}/{RESULTS_STEM}.{{md,csv,json}} + figures in {time.monotonic() - started:.1f}s")


if __name__ == "__main__":
    main()
