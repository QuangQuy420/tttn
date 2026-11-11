"""Step `make experiment-hybrid`: PreferenceScore alone vs PreferenceScore + FaceFit (plan 12).

Nothing is trained or tuned on test here. Scores every (user, candidate) row of the val groups
(1 positive + 20 sampled negatives, selection only) and of the full-ranking test
(`eval_candidates`) with:

- `pref` = `app.ml.preference.predict_preference` of the exported model (`--model-dir`),
  normalized per group by `app.ml.hybrid.normalize_preference` (`none` | `rank`);
- `fit` = `app.ml.face_fit.face_fit(probs, frame_shape)`, frame shape from the `p_shape_*`
  one-hot; `probs` per face scenario: `true` = one-hot of the persona's shape, `noisy_soft` /
  `noisy_hard` = probabilities / argmax one-hot of a real AI-1 test image of that shape
  (`recsys.face_noise`, `N_NOISE_DRAWS` seeded draws per user, a user's metric = mean over draws);
- `final(alpha)` = `app.ml.hybrid.final_score(pref, fit, alpha, 1 - alpha)` for the alpha grid
  (alpha = 1 is `pref_only`, alpha = 0 is `facefit_only`; norm `none` also gets a fine grid near
  1), `facefit_filter` = `pref + 2 * [fit >= 0.5]` and one `popularity` reference row.

Metrics (plan 10, ties by `product_id`): P/R/HR/NDCG @5 and @10 with 95% user-bootstrap CI,
`mean_facefit@10` (FaceFit of the top 10 with the TRUE shape), `diversity@10` (1 - sum of squared
frame-shape shares in the top 10) and `coverage@10`; segments = all users, gamma low / mid / high,
true face shape. `(norm*, alpha*)` = argmax of the val NDCG@10 (all users, `noisy_soft`); the
paired bootstrap vs `pref_only` runs on test per scenario.

Writes `reports/hybrid/{results_val.csv, results_test.csv, results.json, SUMMARY.md}` and
`reports/hybrid/figures/*.png`.
"""
from __future__ import annotations

import argparse
import csv
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.ml import face_fit as face_fit_module
from app.ml import features, hybrid, preference
from app.schemas.recommend import FrameShape
from recsys import baselines, face_noise, metrics
from recsys.common import DATASET_META_JSON, fail, read_json, write_json
from recsys.train import feature_matrix, load_split

TOP_K = 10
N_BOOTSTRAP = 1000
N_NOISE_DRAWS = 20
FIT_FILTER_MIN = 0.5
FILTER_BONUS = 2.0
GAMMA_LOW, GAMMA_HIGH = 0.33, 0.66
SCENARIOS: tuple[str, ...] = ("true", "noisy_soft", "noisy_hard")
SELECTION_SCENARIO = "noisy_soft"
SELECTION_METRIC = f"ndcg@{TOP_K}"
COARSE_ALPHAS: tuple[float, ...] = tuple(round(i / 10, 3) for i in range(11))
FINE_ALPHAS: tuple[float, ...] = tuple(round(0.9 + i / 100, 3) for i in range(11)) + (0.995, 0.999)
# The service default before this plan (plan 11): raw preference, alpha 0.6 / beta 0.4.
SERVICE_BEFORE = ("none", 0.6)
EXTRA_METRICS: tuple[str, ...] = (f"mean_facefit@{TOP_K}", f"diversity@{TOP_K}")
SERVICE_METRICS: tuple[str, ...] = (SELECTION_METRIC, f"hitrate@{TOP_K}", f"mean_facefit@{TOP_K}")
COVERAGE = f"coverage@{TOP_K}"
FRAME_SHAPES: tuple[FrameShape, ...] = tuple(FrameShape)
MODEL_FILE = "model.json"
MODEL_CARD = "model_card.json"
# Categorical slots 1-4 (fixed order) of the dataviz reference palette, light surface (= evaluate.py).
SERIES_COLORS = ("#2a78d6", "#eb6834", "#1baf7a", "#eda100")
INK, MUTED, GRID = "#1f1f1e", "#6b6a64", "#e4e3dd"
SCENARIO_NAMES = {"true": "true shape", "noisy_soft": "noisy, soft probs", "noisy_hard": "noisy, hard label"}

# (scenario, norm, config, alpha); popularity uses ("-", "-", "popularity", None).
Key = tuple[str, str, str, float | None]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset-dir", type=Path, default=Path("data/sim/dataset"))
    parser.add_argument("--personas", type=Path, default=Path("data/sim/personas.parquet"))
    parser.add_argument(
        "--model-dir", type=Path, default=Path("../../recommendation-service/models/preference/v1-sim-20261110-xgbrank")
    )
    parser.add_argument(
        "--face-probabilities",
        type=Path,
        default=Path("../face-shape/reports/runs/v2-full-real-20261005/test_probabilities_svm.csv"),
    )
    parser.add_argument("--reports-dir", type=Path, default=Path("reports/hybrid"))
    parser.add_argument("--seed", type=int, default=42, help="noise draws + bootstrap seed")
    # Product decision (plan 12, Q5): the service default is reported next to the val-selected config.
    parser.add_argument("--service-norm", choices=hybrid.PREFERENCE_NORMS, default="rank", help="service PREFERENCE_NORM")
    parser.add_argument("--service-alpha", type=float, default=0.6, help="service RANK_ALPHA (RANK_BETA = 1 - alpha)")
    return parser


# --- configurations -------------------------------------------------------------------------


def alphas_for(norm: str) -> list[float]:
    """Coarse grid for both norms; norm `none` adds the fine grid near 1 (raw preference ~ 0.01)."""
    if norm == "none":
        return sorted(set(COARSE_ALPHAS) | set(FINE_ALPHAS))
    return list(COARSE_ALPHAS)


def config_name(alpha: float) -> str:
    if alpha == 1.0:
        return "pref_only"
    if alpha == 0.0:
        return "facefit_only"
    return "final"


def final_key(scenario: str, norm: str, alpha: float) -> Key:
    return (scenario, norm, config_name(alpha), alpha)


def select_config(val_curve: Mapping[tuple[str, float], float], exclude_pref_only: bool = False) -> tuple[str, float]:
    """`(norm, alpha)` with the highest val score; ties -> larger alpha, then norm `none`."""
    candidates = [(norm, alpha) for norm, alpha in val_curve if not (exclude_pref_only and alpha == 1.0)]
    if not candidates:
        raise ValueError("no configuration to select from")
    return max(candidates, key=lambda item: (round(val_curve[item], 10), item[1], item[0] == "none"))


# --- scoring --------------------------------------------------------------------------------


def fit_table(prob_rows: np.ndarray) -> np.ndarray:
    """(m, 6) face probabilities in `face_noise.FACE_SHAPES` order -> (m, 8) FaceFit per frame shape,
    computed by the service's `face_fit`."""
    table = np.empty((len(prob_rows), len(FRAME_SHAPES)), dtype=np.float64)
    for i, row in enumerate(prob_rows):
        probs = face_noise.as_probs(row)
        for j, frame in enumerate(FRAME_SHAPES):
            table[i, j] = face_fit_module.face_fit(probs, frame)
    return table


def one_hot_fit_table() -> np.ndarray:
    """(6, 8) FaceFit of the one-hot face shapes (service `one_hot`), rows in `FACE_SHAPES` order."""
    table = np.empty((len(face_noise.FACE_SHAPES), len(FRAME_SHAPES)), dtype=np.float64)
    for i, shape in enumerate(face_noise.FACE_SHAPES):
        probs = face_fit_module.one_hot(shape)
        for j, frame in enumerate(FRAME_SHAPES):
            table[i, j] = face_fit_module.face_fit(probs, frame)
    return table


def normalize_per_group(values: np.ndarray, group_pos: np.ndarray, mode: str) -> np.ndarray:
    """`hybrid.normalize_preference` applied inside every ranking group (one candidate list)."""
    out = np.empty(len(values), dtype=np.float64)
    order = np.argsort(group_pos, kind="stable")
    bounds = np.flatnonzero(np.diff(group_pos[order])) + 1
    for rows in np.split(order, bounds):
        out[rows] = hybrid.normalize_preference(values[rows], mode)
    return out


def final_scores(pref: np.ndarray, fit: np.ndarray, alpha: float) -> np.ndarray:
    return hybrid.final_score(pref, fit, alpha, round(1.0 - alpha, 3))


def filter_scores(pref: np.ndarray, fit: np.ndarray) -> np.ndarray:
    """Suitable frames (FaceFit >= 0.5) strictly first, preference order inside each block."""
    return pref + FILTER_BONUS * (fit >= FIT_FILTER_MIN)


@dataclass
class Split:
    """One split's rows; groups (= users) addressed by position `0..n_groups-1`."""

    name: str
    group_pos: np.ndarray
    users: np.ndarray  # (G,) user_id per group position
    labels: np.ndarray
    product_codes: np.ndarray  # int codes in product_id order (= the tie-break order)
    n_products: int
    frame_idx: np.ndarray  # index into FRAME_SHAPES
    pref: dict[str, np.ndarray]  # norm -> per-row preference
    popularity: np.ndarray
    fit: dict[str, np.ndarray] = field(default_factory=dict)  # scenario -> (D, n_rows)

    @property
    def n_groups(self) -> int:
        return len(self.users)


def frame_shape_index(frame: pd.DataFrame) -> np.ndarray:
    onehot = frame[[f"p_shape_{shape.value}" for shape in FRAME_SHAPES]].to_numpy(dtype=np.float64)
    if not np.all(onehot.sum(axis=1) == 1.0):
        raise ValueError("every row needs exactly one p_shape_* flag")
    return np.argmax(onehot, axis=1)


def load_scored_split(dataset_dir: Path, split: str, booster: Any, calibration: Mapping[str, Any]) -> Split:
    frame = load_split(dataset_dir, split)
    group_ids, group_pos = np.unique(frame["group_id"].to_numpy(), return_inverse=True)
    users = frame.groupby("group_id", sort=True)["user_id"].first().reindex(group_ids).to_numpy()
    if frame.groupby("group_id")["user_id"].nunique().max() != 1:
        raise ValueError(f"{split}: a group spans several users")
    product_ids, product_codes = np.unique(frame["product_id"].astype(str).to_numpy(), return_inverse=True)
    pref = preference.predict_preference(booster, calibration, feature_matrix(frame))
    return Split(
        name=split,
        group_pos=group_pos,
        users=users,
        labels=frame["label"].to_numpy(dtype=np.int64),
        product_codes=product_codes,
        n_products=len(product_ids),
        frame_idx=frame_shape_index(frame),
        pref={norm: normalize_per_group(pref, group_pos, norm) for norm in hybrid.PREFERENCE_NORMS},
        popularity=baselines.popularity_score(frame),
    )


def scenario_fits(split: Split, true_idx: np.ndarray, draws: pd.DataFrame, probs: face_noise.FaceProbabilities) -> dict[str, np.ndarray]:
    """Per scenario a (n_draws, n_rows) FaceFit matrix (`true` has one draw)."""
    onehot_table = one_hot_fit_table()
    soft_table = fit_table(probs.probs)
    hard_table = onehot_table[np.argmax(probs.probs, axis=1)]
    images = draws.loc[split.users].to_numpy()  # (G, D)
    row_images = images[split.group_pos].T  # (D, n_rows)
    return {
        "true": onehot_table[true_idx[split.group_pos], split.frame_idx][None, :],
        "noisy_soft": soft_table[row_images, split.frame_idx[None, :]],
        "noisy_hard": hard_table[row_images, split.frame_idx[None, :]],
    }


@dataclass
class Result:
    per_user: pd.DataFrame  # index = group position, metric columns (mean over draws)
    coverage: dict[str, float]  # segment -> mean coverage@10 over draws


def evaluate_scores(split: Split, scores: np.ndarray, n_catalog: int, segments: Mapping[str, np.ndarray]) -> Result:
    """Plan-10 metrics + FaceFit/diversity/coverage of a (n_draws, n_rows) score matrix; draws are
    ranked in one batch (group id = draw * G + group) and averaged per user."""
    scores = np.atleast_2d(scores)
    n_draws, n_rows = scores.shape
    n_groups = split.n_groups
    combined = (np.arange(n_draws)[:, None] * n_groups + split.group_pos[None, :]).ravel()
    labels = np.tile(split.labels, n_draws)
    products = np.tile(split.product_codes, n_draws)
    flat = scores.ravel()
    per_user = metrics.per_user_metrics(combined, labels, flat, products).reindex(np.arange(n_draws * n_groups))

    top = metrics.top_k(combined, flat, products, TOP_K)
    top_group = top["group_id"].to_numpy()
    top_rows = top["row"].to_numpy() % n_rows
    count = np.bincount(top_group, minlength=n_draws * n_groups).astype(np.float64)
    true_fit = split.fit["true"][0]
    per_user[f"mean_facefit@{TOP_K}"] = np.bincount(top_group, weights=true_fit[top_rows], minlength=n_draws * n_groups) / count
    shape_counts = np.bincount(
        top_group * len(FRAME_SHAPES) + split.frame_idx[top_rows], minlength=n_draws * n_groups * len(FRAME_SHAPES)
    ).reshape(-1, len(FRAME_SHAPES))
    per_user[f"diversity@{TOP_K}"] = 1.0 - ((shape_counts / count[:, None]) ** 2).sum(axis=1)

    columns = list(per_user.columns)
    averaged = pd.DataFrame(per_user.to_numpy().reshape(n_draws, n_groups, -1).mean(axis=0), columns=columns)
    averaged = averaged[averaged[SELECTION_METRIC].notna()]

    presence = np.zeros((n_draws * n_groups, split.n_products), dtype=bool)
    presence[top_group, split.product_codes[top_rows]] = True
    presence = presence.reshape(n_draws, n_groups, split.n_products)
    coverage = {
        name: float(presence[:, mask, :].any(axis=1).sum(axis=1).mean() / n_catalog) for name, mask in segments.items()
    }
    return Result(per_user=averaged, coverage=coverage)


def run_split(split: Split, n_catalog: int, segments: Mapping[str, np.ndarray]) -> dict[Key, Result]:
    results: dict[Key, Result] = {}
    for scenario in SCENARIOS:
        fit = split.fit[scenario]
        for norm in hybrid.PREFERENCE_NORMS:
            pref = split.pref[norm][None, :]
            for alpha in alphas_for(norm):
                results[final_key(scenario, norm, alpha)] = evaluate_scores(split, final_scores(pref, fit, alpha), n_catalog, segments)
            results[(scenario, norm, "facefit_filter", None)] = evaluate_scores(split, filter_scores(pref, fit), n_catalog, segments)
        print(f"{split.name}: scenario {scenario} done")
    results[("-", "-", "popularity", None)] = evaluate_scores(split, split.popularity, n_catalog, segments)
    return results


# --- segments / tables ----------------------------------------------------------------------


def gamma_segment(gamma: np.ndarray) -> np.ndarray:
    return np.where(gamma < GAMMA_LOW, "gamma_low", np.where(gamma > GAMMA_HIGH, "gamma_high", "gamma_mid"))


def segment_masks(users: np.ndarray, personas: pd.DataFrame) -> dict[str, np.ndarray]:
    gamma = gamma_segment(personas.loc[users, "gamma"].to_numpy(dtype=np.float64))
    shapes = personas.loc[users, "face_shape"].astype(str).to_numpy()
    masks = {"all": np.ones(len(users), dtype=bool)}
    for name in ("gamma_low", "gamma_mid", "gamma_high"):
        masks[name] = gamma == name
    for shape in face_noise.FACE_SHAPES:
        masks[f"face_{shape.value}"] = shapes == shape.value
    return masks


def table_rows(results: Mapping[Key, Result], segments: Mapping[str, np.ndarray], seed: int) -> list[list[str]]:
    """Long-format CSV rows: scenario, norm, config, alpha, segment, metric, mean, ci_low, ci_high, n_users."""
    rows: list[list[str]] = []
    for (scenario, norm, config, alpha), result in results.items():
        alpha_text = "" if alpha is None else f"{alpha:.3f}"
        for segment, mask in segments.items():
            per_user = result.per_user[result.per_user.index.isin(np.flatnonzero(mask))]
            n_users = str(len(per_user))
            for metric, cell in metrics.bootstrap_ci(per_user, N_BOOTSTRAP, seed).items():
                values = [f"{cell[key]:.6f}" for key in ("mean", "ci_low", "ci_high")]
                rows.append([scenario, norm, config, alpha_text, segment, metric, *values, n_users])
            rows.append([scenario, norm, config, alpha_text, segment, COVERAGE, f"{result.coverage[segment]:.6f}", "", "", n_users])
    return rows


def write_rows(rows: Sequence[Sequence[str]], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["scenario", "norm", "config", "alpha", "segment", "metric", "mean", "ci_low", "ci_high", "n_users"])
        writer.writerows(rows)


def cells_of(rows: Sequence[Sequence[str]]) -> dict[tuple[str, ...], dict[str, Any]]:
    """`(scenario, norm, config, alpha, segment, metric) -> {mean, ci_low, ci_high, n_users}`."""
    out: dict[tuple[str, ...], dict[str, Any]] = {}
    for row in rows:
        out[tuple(row[:6])] = {
            "mean": float(row[6]),
            "ci_low": float(row[7]) if row[7] else None,
            "ci_high": float(row[8]) if row[8] else None,
            "n_users": int(row[9]),
        }
    return out


def alpha_text(alpha: float) -> str:
    return f"{alpha:.3f}"


def mean_metric(result: Result, metric: str = SELECTION_METRIC, mask: np.ndarray | None = None) -> float:
    per_user = result.per_user if mask is None else result.per_user[result.per_user.index.isin(np.flatnonzero(mask))]
    return float(per_user[metric].mean())


def curve(results: Mapping[Key, Result], scenario: str, mask: np.ndarray | None = None, metric: str = SELECTION_METRIC) -> dict[tuple[str, float], float]:
    return {
        (norm, alpha): mean_metric(results[final_key(scenario, norm, alpha)], metric, mask)
        for norm in hybrid.PREFERENCE_NORMS
        for alpha in alphas_for(norm)
    }


def paired_keys(results: Mapping[Key, Result], key_a: Key, key_b: Key, mask: np.ndarray, seed: int) -> dict[str, float]:
    """Paired bootstrap of per-user NDCG@10: `key_a` minus `key_b` on the users in `mask`."""
    a = results[key_a].per_user[SELECTION_METRIC]
    b = results[key_b].per_user[SELECTION_METRIC]
    users = a.index.intersection(b.index)
    users = users[np.isin(users, np.flatnonzero(mask))]
    out = metrics.paired_bootstrap(a.loc[users].to_numpy(), b.loc[users].to_numpy(), N_BOOTSTRAP, seed)
    out.update({"reference": float(b.loc[users].mean()), "config": float(a.loc[users].mean()), "n_users": int(len(users))})
    return out


def paired(results: Mapping[Key, Result], scenario: str, norm: str, alpha: float, mask: np.ndarray, seed: int) -> dict[str, float]:
    """Paired bootstrap of per-user NDCG@10: `final(norm, alpha)` minus `pref_only` (same norm)."""
    out = paired_keys(results, final_key(scenario, norm, alpha), final_key(scenario, norm, 1.0), mask, seed)
    out["compared"] = f"{config_name(alpha)}(norm={norm}, alpha={alpha_text(alpha)}) - pref_only"
    out["pref_only"] = out.pop("reference")
    return out


def service_default_block(
    val: Mapping[Key, Result],
    test: Mapping[Key, Result],
    test_masks: Mapping[str, np.ndarray],
    service: tuple[str, float],
    selected: tuple[str, float],
    seed: int,
) -> dict[str, Any]:
    """The product-chosen service config (plan 12, Q5) per scenario: val/test NDCG@10, HR@10,
    mean FaceFit@10, paired test vs `pref_only` and vs the val-selected config, gamma deltas."""
    norm, alpha = service
    gamma_segments = ("gamma_low", "gamma_mid", "gamma_high")
    out: dict[str, Any] = {"norm": norm, "alpha": alpha, "beta": round(1.0 - alpha, 3), "scenarios": {}}
    for scenario in SCENARIOS:
        key = final_key(scenario, norm, alpha)
        out["scenarios"][scenario] = {
            "val": {metric: mean_metric(val[key], metric) for metric in SERVICE_METRICS},
            "test": {metric: mean_metric(test[key], metric) for metric in SERVICE_METRICS},
            "vs_pref_only": paired(test, scenario, norm, alpha, test_masks["all"], seed),
            "vs_selected": paired_keys(test, key, final_key(scenario, *selected), test_masks["all"], seed),
            "gamma_vs_pref_only": {segment: paired(test, scenario, norm, alpha, test_masks[segment], seed) for segment in gamma_segments},
        }
    return out


# --- figures --------------------------------------------------------------------------------


def _style_axis(ax: Any) -> None:
    ax.grid(color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)


def plot_figures(report: dict[str, Any], val: Mapping[Key, Result], test: Mapping[Key, Result], test_masks: Mapping[str, np.ndarray], figures_dir: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figures_dir.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED, "ytick.color": MUTED, "font.size": 9})
    norm_star = report["selection"]["norm"]
    alpha_star = report["selection"]["alpha"]
    service_norm, service_alpha = report["service_default"]["norm"], report["service_default"]["alpha"]
    norms = hybrid.PREFERENCE_NORMS

    # 1. NDCG@10 vs alpha, val and test, both norms; bottom row zooms on alpha in [0.9, 1].
    curves = {"val": curve(val, SELECTION_SCENARIO), "test": curve(test, SELECTION_SCENARIO)}
    fig, axes = plt.subplots(2, 2, figsize=(10, 7.4))
    for col, split in enumerate(("val", "test")):
        for row, (low, high) in enumerate(((0.0, 1.0), (0.9, 1.0))):
            ax = axes[row, col]
            for color, norm in zip(SERIES_COLORS, norms):
                xs = [a for a in alphas_for(norm) if low <= a <= high]
                ax.plot(xs, [curves[split][(norm, a)] for a in xs], color=color, linewidth=2, marker="o", markersize=4, label=f"norm = {norm}")
            ax.plot([alpha_star], [curves[split][(norm_star, alpha_star)]], linestyle="none", marker="*", markersize=14, color=INK, label=f"selected (norm={norm_star}, alpha={alpha_star:g})")
            if low <= service_alpha <= high:
                ax.plot([service_alpha], [curves[split][(service_norm, service_alpha)]], linestyle="none", marker="D", markersize=8, markerfacecolor="white", markeredgecolor=INK, markeredgewidth=1.5, label=f"service default (norm={service_norm}, alpha={service_alpha:g})")
            ax.set_xlim(low - (high - low) * 0.02, high + (high - low) * 0.02)
            ax.set_title(f"{split} NDCG@{TOP_K}, {SCENARIO_NAMES[SELECTION_SCENARIO]}" + (" (zoom)" if row else ""), color=INK)
            ax.set_xlabel("alpha (beta = 1 - alpha)")
            _style_axis(ax)
        axes[0, col].legend(loc="lower right", fontsize=7, frameon=False)
    axes[0, 0].set_ylabel(f"mean NDCG@{TOP_K} (sampled val groups)")
    axes[0, 1].set_ylabel(f"mean NDCG@{TOP_K} (full-ranking test)")
    fig.suptitle("FinalScore = alpha * PreferenceScore + beta * FaceFit - simulated data (selection on val only)", color=INK)
    fig.tight_layout()
    fig.savefig(figures_dir / "ndcg_vs_alpha.png", dpi=150)
    plt.close(fig)

    # 2. Test NDCG@10 vs alpha per gamma segment.
    fig, axes = plt.subplots(1, 3, figsize=(12, 4.0))
    for ax, segment in zip(axes, ("gamma_low", "gamma_mid", "gamma_high")):
        seg_curve = curve(test, SELECTION_SCENARIO, test_masks[segment])
        for color, norm in zip(SERIES_COLORS, norms):
            xs = alphas_for(norm)
            ax.plot(xs, [seg_curve[(norm, a)] for a in xs], color=color, linewidth=2, marker="o", markersize=3, label=f"norm = {norm}")
        ax.axvline(alpha_star, color=MUTED, linewidth=1, linestyle=":", label=f"selected alpha = {alpha_star:g}")
        n_users = int(test_masks[segment].sum())
        ax.set_title(f"{segment} (n = {n_users})", color=INK)
        ax.set_xlabel("alpha (beta = 1 - alpha)")
        _style_axis(ax)
    axes[0].set_ylabel(f"test NDCG@{TOP_K}")
    axes[0].legend(loc="lower right", fontsize=7, frameon=False)
    fig.suptitle(f"Test NDCG@{TOP_K} by face-shape interest gamma ({SCENARIO_NAMES[SELECTION_SCENARIO]}; y-axes differ)", color=INK)
    fig.tight_layout()
    fig.savefig(figures_dir / "ndcg_vs_alpha_by_gamma.png", dpi=150)
    plt.close(fig)

    # 3 + 4. Test NDCG@10 / mean FaceFit@10 vs alpha per face scenario, one panel per norm.
    for name, metric, ylabel in (
        ("true_vs_noisy.png", SELECTION_METRIC, f"test NDCG@{TOP_K}"),
        ("facefit_at_k.png", f"mean_facefit@{TOP_K}", f"mean FaceFit of the top {TOP_K} (true shape)"),
    ):
        fig, axes = plt.subplots(1, 2, figsize=(10, 4.2), sharey=True)
        for ax, norm in zip(axes, norms):
            xs = alphas_for(norm)
            for color, scenario in zip(SERIES_COLORS, SCENARIOS):
                ys = [mean_metric(test[final_key(scenario, norm, a)], metric) for a in xs]
                ax.plot(xs, ys, color=color, linewidth=2, marker="o", markersize=3, label=SCENARIO_NAMES[scenario])
            if norm == norm_star:
                ax.axvline(alpha_star, color=MUTED, linewidth=1, linestyle=":", label=f"selected alpha = {alpha_star:g}")
            ax.set_title(f"preference norm = {norm}", color=INK)
            ax.set_xlabel("alpha (beta = 1 - alpha)")
            _style_axis(ax)
            ax.legend(loc="best", fontsize=7, frameon=False)
        axes[0].set_ylabel(ylabel)
        fig.suptitle(f"{ylabel} vs alpha - true vs noisy face shape (AI 1 test predictions)", color=INK)
        fig.tight_layout()
        fig.savefig(figures_dir / name, dpi=150)
        plt.close(fig)


# --- SUMMARY.md -----------------------------------------------------------------------------


def _ci(cell: Mapping[str, Any], digits: int = 4) -> str:
    if cell["ci_low"] is None:
        return f"{cell['mean']:.{digits}f}"
    return f"{cell['mean']:.{digits}f} [{cell['ci_low']:.{digits}f}, {cell['ci_high']:.{digits}f}]"


def _delta(sig: Mapping[str, Any]) -> str:
    return f"{sig['delta']:+.4f} [{sig['ci_low']:+.4f}, {sig['ci_high']:+.4f}]"


def _p(value: float) -> str:
    return "< 0.001" if value < 0.001 else f"{value:.3f}"


def _significant(sig: Mapping[str, Any]) -> bool:
    return sig["ci_low"] > 0 or sig["ci_high"] < 0


def _vi_delta(sig: Mapping[str, Any]) -> str:
    """Vietnamese wording of a paired difference, driven by its sign and CI."""
    if _significant(sig):
        direction = "tăng" if sig["delta"] > 0 else "giảm"
        return f"{direction} {abs(sig['delta']):.4f} (CI 95% [{sig['ci_low']:+.4f}, {sig['ci_high']:+.4f}], p = {_p(sig['p_value'])}, có ý nghĩa)"
    return f"thay đổi {sig['delta']:+.4f} (CI 95% [{sig['ci_low']:+.4f}, {sig['ci_high']:+.4f}] chứa 0, p = {_p(sig['p_value'])}, không có ý nghĩa thống kê)"


def findings_vi(report: dict[str, Any]) -> list[str]:
    sel = report["selection"]
    comp = report["comparison"]
    sig = report["significance"]
    seg = report["gamma_segments"]
    paragraphs: list[str] = []

    if sel["fallback"]:
        first = (
            f"Trên validation (kịch bản dáng mặt nhiễu, xác suất mềm), cấu hình tốt nhất là chỉ dùng PreferenceScore "
            f"(α* = 1, NDCG@10 val = {sel['val_ndcg@10']:.4f}): ghép FaceFit không cải thiện trên validation, nên service giữ α = 1, β = 0. "
            f"Để vẫn đo tác động của FaceFit, kiểm định so sánh cấu hình tốt nhất có α < 1 (norm = {comp['norm']}, α = {comp['alpha']:g}, "
            f"NDCG@10 val = {comp['val_ndcg@10']:.4f}) với chỉ Preference."
        )
    else:
        first = (
            f"Trên validation (kịch bản dáng mặt nhiễu, xác suất mềm), cấu hình tốt nhất là norm = {sel['norm']}, α* = {sel['alpha']:g}, "
            f"β* = {sel['beta']:g} (NDCG@10 val = {sel['val_ndcg@10']:.4f}, so với {report['val_pref_only']:.4f} khi chỉ dùng Preference)."
        )
    paragraphs.append(first)

    lines = ["Trên tập test (xếp hạng toàn bộ), so với chỉ Preference, NDCG@10 của cấu hình được so sánh:"]
    for scenario in SCENARIOS:
        lines.append(f"với dáng mặt {SCENARIO_VI[scenario]} {_vi_delta(sig[scenario])}")
    paragraphs.append(lines[0] + " " + "; ".join(lines[1:]) + ".")

    best = report["val_best_per_norm"]
    paragraphs.append(
        f"So sánh hai kiểu thang điểm Preference trên validation: giữ nguyên đạt tốt nhất {best['none']['val_ndcg@10']:.4f} "
        f"(α = {best['none']['alpha']:g}), chuẩn hóa theo hạng đạt tốt nhất {best['rank']['val_ndcg@10']:.4f} (α = {best['rank']['alpha']:g}); "
        f"kiểu được chọn là `{sel['norm']}`."
    )

    d_true, d_soft, d_hard = (sig[s]["delta"] for s in SCENARIOS)
    any_significant = any(_significant(sig[s]) for s in SCENARIOS)
    noise = (
        f"Theo kịch bản dáng mặt, chênh lệch NDCG@10 là {d_true:+.4f} (dáng mặt đúng), {d_soft:+.4f} (nhiễu, xác suất mềm) "
        f"và {d_hard:+.4f} (nhiễu, nhãn cứng)"
    )
    if not any_significant:
        noise += (
            "; cả ba khoảng tin cậy đều chứa 0 nên không kết luận được lợi ích giảm theo nhiễu hay xác suất mềm tốt hơn nhãn cứng ở mức toàn bộ người dùng."
        )
    else:
        noise += "; " + ("lợi ích giảm khi dáng mặt bị đoán sai" if d_soft < d_true else "lợi ích không giảm khi dáng mặt bị đoán sai")
        noise += ", và xác suất mềm " + ("giữ được nhiều lợi ích hơn nhãn cứng." if d_soft > d_hard else "không tốt hơn nhãn cứng.")
    paragraphs.append(noise)

    labels = {"gamma_low": "γ thấp", "gamma_mid": "γ vừa", "gamma_high": "γ cao"}
    for scenario in (SELECTION_SCENARIO, "true"):
        parts = [f"{labels[segment]} (n = {seg[scenario][segment]['n_users']}): {_vi_delta(seg[scenario][segment])}" for segment in labels]
        text = f"Theo nhóm γ (test, dáng mặt {SCENARIO_VI[scenario]}): " + "; ".join(parts) + ". "
        significant = [labels[segment] for segment in labels if _significant(seg[scenario][segment])]
        deltas = {segment: seg[scenario][segment]["delta"] for segment in labels}
        largest = max(deltas, key=deltas.get)
        if significant:
            text += f"Nhóm có thay đổi có ý nghĩa: {', '.join(significant)}. "
        else:
            text += "Không nhóm nào có thay đổi có ý nghĩa thống kê. "
        text += f"Chênh lệch lớn nhất ở nhóm {labels[largest]} ({deltas[largest]:+.4f})"
        text += (
            ", cùng chiều với giả thuyết FaceFit giúp người quan tâm nhiều đến dáng mặt."
            if largest == "gamma_high" and deltas["gamma_high"] > 0
            else ", không khớp với giả thuyết FaceFit giúp chủ yếu nhóm γ cao."
        )
        paragraphs.append(text)

    face_significant = [
        f"{segment.removeprefix('face_')} ({seg[SELECTION_SCENARIO][segment]['delta']:+.4f}, p = {_p(seg[SELECTION_SCENARIO][segment]['p_value'])})"
        for segment in report["segment_order"]
        if segment.startswith("face_") and _significant(seg[SELECTION_SCENARIO][segment])
    ]
    paragraphs.append(
        "Theo dáng mặt thật (test, xác suất mềm), nhóm có thay đổi có ý nghĩa: " + ", ".join(face_significant) + "."
        if face_significant
        else "Theo dáng mặt thật (test, xác suất mềm), không nhóm nào có thay đổi có ý nghĩa thống kê."
    )

    before = report["service_before"]
    scale = (
        f"Với thang điểm Preference giữ nguyên (trung vị PreferenceScore trên test = {before['test_pref_median']:.4f}), mặc định cũ của service "
        f"(α = {before['alpha']:g}, β = {round(1 - before['alpha'], 3):g}) cho NDCG@10 test "
        f"{before['test_ndcg@10']:.4f}, so với {before['test_pref_only']:.4f} của chỉ Preference và {before['test_facefit_only']:.4f} của chỉ FaceFit"
    )
    gap_pref = abs(before["test_ndcg@10"] - before["test_pref_only"])
    gap_fit = abs(before["test_ndcg@10"] - before["test_facefit_only"])
    scale += (
        ": kết quả gần với chỉ FaceFit hơn, tức FaceFit lấn át Preference ở thang này."
        if gap_fit < gap_pref
        else ": kết quả gần với chỉ Preference hơn chỉ FaceFit."
    )
    paragraphs.append(scale)

    fit = report["facefit_top10"]
    paragraphs.append(
        f"FaceFit trung bình của top-10 (theo dáng mặt thật, test, xác suất mềm) đi từ {fit['pref_only']:.3f} (chỉ Preference) "
        f"lên {fit['config']:.3f} với cấu hình được so sánh; độ đa dạng dáng gọng@10 từ {fit['div_pref_only']:.3f} thành {fit['div_config']:.3f}."
        if fit["config"] >= fit["pref_only"]
        else f"FaceFit trung bình của top-10 (theo dáng mặt thật, test, xác suất mềm) giảm từ {fit['pref_only']:.3f} xuống {fit['config']:.3f}; "
        f"độ đa dạng dáng gọng@10 từ {fit['div_pref_only']:.3f} thành {fit['div_config']:.3f}."
    )

    test_best = report["test_curve_best"]
    if test_best["norm"] == sel["norm"] and test_best["alpha"] == sel["alpha"]:
        paragraphs.append("Điểm tốt nhất trên đường cong α của test trùng với cấu hình chọn trên validation.")
    else:
        paragraphs.append(
            f"Lưu ý: trên test, điểm cao nhất của đường cong α là norm = {test_best['norm']}, α = {test_best['alpha']:g} "
            f"(NDCG@10 = {test_best['ndcg@10']:.4f}), khác với cấu hình chọn trên validation; cấu hình không được chọn lại theo test."
        )
    return paragraphs


def service_default_vi(report: dict[str, Any]) -> list[str]:
    """Vietnamese section on the product-chosen service default, wording driven by the numbers."""
    sel = report["selection"]
    svc = report["service_default"]
    before = report["service_before"]
    lines = [
        f"Thí nghiệm chọn trên validation: norm = `{sel['norm']}`, α = {sel['alpha']:g}, β = {sel['beta']:g}. "
        f"Service dùng **`PREFERENCE_NORM={svc['norm']}`, `RANK_ALPHA={svc['alpha']:g}`, `RANK_BETA={svc['beta']:g}`** theo **lựa chọn sản phẩm**, "
        "không phải cấu hình thí nghiệm chọn. Lý do: với β rất nhỏ, dáng mặt gần như không còn tác dụng với khách chưa đăng nhập "
        "(PreferenceScore của họ là popularity đã chuẩn hóa theo hạng), trong khi thí nghiệm này chỉ đo người dùng đã có lịch sử. "
        "Bảng dưới là cái giá (hoặc lợi ích) đo được của lựa chọn đó trên người dùng có lịch sử.",
        "",
        "| scenario | val NDCG@10 | test NDCG@10 | test HR@10 | test mean FaceFit@10 | Δ vs pref_only [95% CI], p | Δ vs selected [95% CI], p |",
        "|---|---|---|---|---|---|---|",
    ]
    for scenario in SCENARIOS:
        cell = svc["scenarios"][scenario]
        lines.append(
            f"| {scenario} | {cell['val'][SELECTION_METRIC]:.4f} | {cell['test'][SELECTION_METRIC]:.4f} | {cell['test'][f'hitrate@{TOP_K}']:.4f} | "
            f"{cell['test'][f'mean_facefit@{TOP_K}']:.4f} | {_delta(cell['vs_pref_only'])}, {_p(cell['vs_pref_only']['p_value'])} | "
            f"{_delta(cell['vs_selected'])}, {_p(cell['vs_selected']['p_value'])} |"
        )
    lines += ["", "| γ segment | scenario | n | Δ vs pref_only [95% CI] | p |", "|---|---|---|---|---|"]
    for segment in ("gamma_low", "gamma_mid", "gamma_high"):
        for scenario in SCENARIOS:
            cell = svc["scenarios"][scenario]["gamma_vs_pref_only"][segment]
            lines.append(f"| {segment} | {scenario} | {cell['n_users']} | {_delta(cell)} | {_p(cell['p_value'])} |")

    main = svc["scenarios"][SELECTION_SCENARIO]
    vs_pref, vs_sel = main["vs_pref_only"], main["vs_selected"]
    text = (
        f"Với dáng mặt nhiễu (xác suất mềm, sát với thực tế nhất), mặc định của service đạt NDCG@10 test {main['test'][SELECTION_METRIC]:.4f}: "
        f"so với chỉ Preference {_vi_delta(vs_pref)}; so với cấu hình thí nghiệm chọn {_vi_delta(vs_sel)}."
    )
    worse = [SCENARIO_VI[s] for s in SCENARIOS if _significant(svc["scenarios"][s]["vs_pref_only"]) and svc["scenarios"][s]["vs_pref_only"]["delta"] < 0]
    better = [SCENARIO_VI[s] for s in SCENARIOS if _significant(svc["scenarios"][s]["vs_pref_only"]) and svc["scenarios"][s]["vs_pref_only"]["delta"] > 0]
    if worse:
        text += f" Mặc định của service **kém hơn chỉ Preference có ý nghĩa thống kê** với dáng mặt {', '.join(worse)}: đây là cái giá về độ chính xác của lựa chọn sản phẩm."
    if better:
        text += f" Mặc định của service tốt hơn chỉ Preference có ý nghĩa với dáng mặt {', '.join(better)}."
    if not worse and not better:
        text += " Ở cả ba kịch bản, khác biệt so với chỉ Preference không có ý nghĩa thống kê."
    gamma = main["gamma_vs_pref_only"]
    text += (
        " Theo nhóm γ (xác suất mềm): "
        + "; ".join(f"{label} {gamma[segment]['delta']:+.4f} (p = {_p(gamma[segment]['p_value'])})" for segment, label in (("gamma_low", "γ thấp"), ("gamma_mid", "γ vừa"), ("gamma_high", "γ cao")))
        + "."
    )
    fit_gain = main["test"][f"mean_facefit@{TOP_K}"] - report["facefit_top10"]["pref_only"]
    text += f" Đổi lại, FaceFit trung bình của top-10 (dáng mặt thật) {'tăng' if fit_gain >= 0 else 'giảm'} {abs(fit_gain):.3f} so với chỉ Preference."
    text += (
        f" So với mặc định cũ (`none`, α = {before['alpha']:g}), NDCG@10 test thay đổi {main['test'][SELECTION_METRIC] - before['test_ndcg@10']:+.4f} "
        f"({before['test_ndcg@10']:.4f} → {main['test'][SELECTION_METRIC]:.4f})."
    )
    return lines + ["", text]


SCENARIO_VI = {"true": "đúng", "noisy_soft": "nhiễu (xác suất mềm)", "noisy_hard": "nhiễu (nhãn cứng)"}

LIMITATIONS_VI = [
    "Dữ liệu là dữ liệu mô phỏng: hàm sinh hành vi của simulator có thành phần `γ_u·M` (chính bảng tương thích dùng trong FaceFit), "
    "nên phần lợi ích của FaceFit một phần phản ánh giả định của simulator, không phải bằng chứng trên người dùng thật.",
    "Không có bảng kết quả trên dữ liệu thật: `data/real` không có persona và bảng `face_analyses` local đang trống, nên không tính được FaceFit (Q1).",
    "Kịch bản nhiễu rút ảnh từ 701 ảnh test của model AI 1; dáng mặt DIAMOND chỉ có 19 ảnh để rút, nên nhiễu của nhóm này kém đa dạng.",
    "Xếp hạng offline không có bước re-rank đa dạng và phá hòa theo `product_id` (service phá hòa theo popularity); "
    "các dòng α = 0 và α nhỏ có nhiều điểm bằng nhau nên phụ thuộc vào thứ tự này.",
    "Cấu hình được chọn trên các nhóm val lấy mẫu (21 dòng/nhóm), còn test xếp hạng 25–58 ứng viên; model preference cũng đã được "
    "tune và calibrate trên chính các nhóm val này, nên α chọn trên val có thể khác α tốt nhất trên test.",
    "Cần kiểm chứng trên lưu lượng thật (A/B test) trong tương lai.",
]


def write_summary(report: dict[str, Any], test_cells: Mapping[tuple[str, ...], dict[str, Any]], val_curve: Mapping[tuple[str, float], float], test_curve: Mapping[tuple[str, float], float], path: Path) -> None:
    sel = report["selection"]
    comp = report["comparison"]
    svc = report["service_default"]
    lines = [
        "# Hybrid experiment (plan 12) - PreferenceScore vs PreferenceScore + FaceFit",
        "",
        f"Generated by `python -m recsys.experiment_hybrid` (seed {report['settings']['seed']}). **All numbers are on simulated data.** "
        "Do not edit by hand - rerun `make experiment-hybrid`.",
        "",
        "## Protocol",
        "",
        f"- Model: `{report['settings']['model_dir']}` (frozen; nothing is trained here). Dataset `{report['settings']['dataset_dir']}`, "
        f"{report['settings']['n_catalog_products']} catalog products.",
        "- `FinalScore = alpha * pref + beta * FaceFit`, `beta = 1 - alpha`, computed by `app.ml.hybrid.final_score`; FaceFit by "
        "`app.ml.face_fit.face_fit` (service code, imported). `pref` = calibrated PreferenceScore, either raw (`norm = none`, as the "
        "service before this plan) or rank-normalized inside each candidate list (`norm = rank`, top = 1).",
        f"- alpha grid 0.0, 0.1, ..., 1.0 for both norms; norm `none` also 0.90, 0.91, ..., 1.00, 0.995, 0.999. alpha = 1 = `pref_only`, "
        f"alpha = 0 = `facefit_only`. `facefit_filter` = `pref + {FILTER_BONUS:g} * [FaceFit >= {FIT_FILTER_MIN}]`. `popularity` = reference.",
        f"- Face scenarios: `true` = one-hot of the persona's face shape; `noisy_soft` / `noisy_hard` = probabilities / argmax one-hot of a "
        f"real AI-1 (SVM) test image with the same true shape (`{report['settings']['face_probabilities']}`), {N_NOISE_DRAWS} seeded draws "
        "per user, the same draws for every configuration and split; a user's metric = mean over draws.",
        f"- Metrics as plan 10 (ties by `product_id`), 95% CI = {N_BOOTSTRAP} user-bootstrap resamples. `mean_facefit@{TOP_K}` uses the TRUE "
        f"shape; `diversity@{TOP_K}` = 1 - sum of squared frame-shape shares in the top {TOP_K}; `coverage@{TOP_K}` = catalog share (no CI).",
        f"- Segments: gamma low (< {GAMMA_LOW}), mid, high (> {GAMMA_HIGH}); true face shape. Persona fields are used only for segments and the noise draws.",
        "- **Selection on val only**: argmax of the mean val-group NDCG@10 (sampled 1 + 20 groups, optimistic), all users, `noisy_soft`; "
        "ties -> larger alpha, then `none`. Test (`eval_candidates`, full ranking) is reported once and never used to choose.",
        "",
        "## Selected configuration",
        "",
        f"- **norm\\* = `{sel['norm']}`, alpha\\* = {sel['alpha']:g}, beta\\* = {sel['beta']:g}** (val NDCG@10 = {sel['val_ndcg@10']:.4f}; "
        f"`pref_only` = {report['val_pref_only']:.4f}).",
    ]
    if sel["fallback"]:
        lines.append(
            f"- alpha\\* = 1: **no FaceFit gain on validation**. The paired test below compares the best alpha < 1 instead "
            f"(norm `{comp['norm']}`, alpha {comp['alpha']:g}, val NDCG@10 = {comp['val_ndcg@10']:.4f}); the service keeps the selected values."
        )
    lines += [
        "",
        f"## NDCG@{TOP_K} vs alpha ({SCENARIO_NAMES[SELECTION_SCENARIO]}, all users)",
        "",
        "Val = sampled groups (selection); test = full ranking (report only). `*` = selected.",
        "",
        "| alpha | val none | test none | val rank | test rank |",
        "|---|---|---|---|---|",
    ]
    for alpha in alphas_for("none"):
        cells = []
        for norm in hybrid.PREFERENCE_NORMS:
            for source in (val_curve, test_curve):
                value = source.get((norm, alpha))
                mark = "*" if (norm, alpha) == (sel["norm"], sel["alpha"]) else ""
                cells.append("-" if value is None else f"{value:.4f}{mark}")
        lines.append(f"| {alpha:g} | " + " | ".join(cells) + " |")

    columns = ["ndcg@5", "ndcg@10", "hitrate@5", "hitrate@10", "precision@10", f"mean_facefit@{TOP_K}", f"diversity@{TOP_K}", COVERAGE]
    lines += ["", "## Test - all users (full ranking)", "", "| scenario | configuration | n | " + " | ".join(columns) + " |", "|---|---|---|" + "---|" * len(columns)]
    for scenario in SCENARIOS:
        rows_spec = [
            ("pref_only", (scenario, "none", "pref_only", alpha_text(1.0))),
            ("facefit_only", (scenario, "none", "facefit_only", alpha_text(0.0))),
            ("facefit_filter", (scenario, "none", "facefit_filter", "")),
            ("before: none, alpha 0.6", (scenario, "none", "final", alpha_text(0.6))),
            (f"service default: {svc['norm']}, alpha {svc['alpha']:g}", (scenario, svc["norm"], config_name(svc["alpha"]), alpha_text(svc["alpha"]))),
            (f"selected: {sel['norm']}, alpha {sel['alpha']:g}", (scenario, sel["norm"], config_name(sel["alpha"]), alpha_text(sel["alpha"]))),
        ]
        if sel["fallback"]:
            rows_spec.append((f"compared: {comp['norm']}, alpha {comp['alpha']:g}", (scenario, comp["norm"], config_name(comp["alpha"]), alpha_text(comp["alpha"]))))
        for label, key in rows_spec:
            cells = [_ci(test_cells[(*key, "all", column)]) for column in columns]
            lines.append(f"| {scenario} | {label} | {test_cells[(*key, 'all', 'ndcg@10')]['n_users']} | " + " | ".join(cells) + " |")
    pop = ("-", "-", "popularity", "")
    lines.append(f"| - | popularity | {test_cells[(*pop, 'all', 'ndcg@10')]['n_users']} | " + " | ".join(_ci(test_cells[(*pop, "all", c)]) for c in columns) + " |")

    lines += [
        "",
        f"## Significance (test, paired bootstrap of per-user NDCG@{TOP_K})",
        "",
        f"Compared: `{report['significance']['true']['compared']}`. Two-sided p = 2 * min(P(delta* <= 0), P(delta* >= 0)).",
        "",
        "| scenario | pref_only | compared | delta [95% CI] | p | n |",
        "|---|---|---|---|---|---|",
    ]
    for scenario in SCENARIOS:
        sig = report["significance"][scenario]
        lines.append(f"| {scenario} | {sig['pref_only']:.4f} | {sig['config']:.4f} | {_delta(sig)} | {_p(sig['p_value'])} | {sig['n_users']} |")

    lines += [
        "",
        f"## Segments (test, NDCG@{TOP_K}, compared configuration - pref_only)",
        "",
        "| segment | scenario | n | pref_only | compared | delta [95% CI] | p |",
        "|---|---|---|---|---|---|---|",
    ]
    for segment in report["segment_order"]:
        for scenario in SCENARIOS:
            cell = report["gamma_segments"][scenario][segment]
            lines.append(
                f"| {segment} | {scenario} | {cell['n_users']} | {cell['pref_only']:.4f} | {cell['config']:.4f} | {_delta(cell)} | {_p(cell['p_value'])} |"
            )

    lines += ["", "## Mặc định của service", ""] + service_default_vi(report)
    lines += ["", "## Nhận xét (tự sinh từ số liệu)", ""]
    for paragraph in findings_vi(report):
        lines += [paragraph, ""]
    lines += ["## Giới hạn", ""] + [f"- {item}" for item in LIMITATIONS_VI]
    lines += [
        "",
        "## Files",
        "",
        "- `results_val.csv`, `results_test.csv` - every configuration x norm x scenario x segment x metric (long format)",
        "- `results.json` - selection, significance, segment comparison, run settings",
        f"- `figures/ndcg_vs_alpha.png` - val and test NDCG@{TOP_K} vs alpha, both norms, selected point (bottom row: alpha 0.9-1)",
        f"- `figures/ndcg_vs_alpha_by_gamma.png` - test NDCG@{TOP_K} vs alpha per gamma segment",
        f"- `figures/true_vs_noisy.png` - test NDCG@{TOP_K} vs alpha for the true / noisy-soft / noisy-hard face shape",
        f"- `figures/facefit_at_k.png` - mean FaceFit of the top {TOP_K} vs alpha",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


# --- main -----------------------------------------------------------------------------------


def load_model(model_dir: Path) -> tuple[Any, dict[str, Any]]:
    import xgboost

    card = read_json(model_dir / MODEL_CARD)
    if card is None or not (model_dir / MODEL_FILE).is_file():
        fail(f"{model_dir} must hold {MODEL_FILE} + {MODEL_CARD} (an exported XGBoost model, plan 10)")
    if card.get("feature_names") != features.feature_names():
        fail(f"{model_dir / MODEL_CARD}: feature_names differ from app.ml.features.feature_names()")
    return xgboost.Booster(model_file=str(model_dir / MODEL_FILE)), card


def main() -> None:
    args = build_parser().parse_args()
    started = time.monotonic()
    booster, card = load_model(args.model_dir)
    meta = read_json(args.dataset_dir / DATASET_META_JSON) or {}
    n_catalog = int(meta["n_catalog_products"])
    if not args.personas.is_file():
        fail(f"{args.personas} not found - run `make all CATALOG_SOURCE=seed` first")
    personas = pd.read_parquet(args.personas).set_index("user_id")
    if args.service_alpha not in alphas_for(args.service_norm):
        fail(f"--service-alpha {args.service_alpha} is not on the alpha grid of norm {args.service_norm}: {alphas_for(args.service_norm)}")
    try:
        probs = face_noise.load_face_probabilities(args.face_probabilities)
    except (FileNotFoundError, ValueError) as exc:
        fail(str(exc))

    splits = {name: load_scored_split(args.dataset_dir, name, booster, card["calibration"]) for name in ("val", "eval_candidates")}
    all_users = sorted(set(splits["val"].users) | set(splits["eval_candidates"].users))
    missing = sorted(set(all_users) - set(personas.index))
    if missing:
        fail(f"{len(missing)} dataset users are missing from {args.personas}")
    draws = face_noise.draw_images(personas.loc[all_users, "face_shape"].astype(str).to_dict(), probs.labels, N_NOISE_DRAWS, args.seed)
    shape_index = {shape.value: i for i, shape in enumerate(face_noise.FACE_SHAPES)}

    results: dict[str, dict[Key, Result]] = {}
    masks: dict[str, dict[str, np.ndarray]] = {}
    for name, split in splits.items():
        true_idx = personas.loc[split.users, "face_shape"].astype(str).map(shape_index).to_numpy()
        split.fit = scenario_fits(split, true_idx, draws, probs)
        masks[name] = segment_masks(split.users, personas)
        results[name] = run_split(split, n_catalog, masks[name])
    val, test = results["val"], results["eval_candidates"]
    test_masks = masks["eval_candidates"]

    # Selection on val only, then the paired comparison on test.
    val_curve = curve(val, SELECTION_SCENARIO)
    test_curve = curve(test, SELECTION_SCENARIO)
    norm_star, alpha_star = select_config(val_curve)
    fallback = alpha_star == 1.0
    norm_cmp, alpha_cmp = select_config(val_curve, exclude_pref_only=True) if fallback else (norm_star, alpha_star)
    segment_order = ["all", "gamma_low", "gamma_mid", "gamma_high"] + [f"face_{shape.value}" for shape in face_noise.FACE_SHAPES]
    significance = {scenario: paired(test, scenario, norm_cmp, alpha_cmp, test_masks["all"], args.seed) for scenario in SCENARIOS}
    segments = {
        scenario: {segment: paired(test, scenario, norm_cmp, alpha_cmp, test_masks[segment], args.seed) for segment in segment_order}
        for scenario in SCENARIOS
    }
    test_best_norm, test_best_alpha = select_config(test_curve)
    service = (args.service_norm, args.service_alpha)
    service_default = service_default_block(val, test, test_masks, service, (norm_star, alpha_star), args.seed)
    cmp_result = test[final_key(SELECTION_SCENARIO, norm_cmp, alpha_cmp)]
    pref_result = test[final_key(SELECTION_SCENARIO, norm_cmp, 1.0)]
    report: dict[str, Any] = {
        "settings": {
            "seed": args.seed,
            "n_noise_draws": N_NOISE_DRAWS,
            "n_bootstrap": N_BOOTSTRAP,
            "top_k": TOP_K,
            "dataset_dir": str(args.dataset_dir),
            "personas": str(args.personas),
            "model_dir": str(args.model_dir),
            "model_created_at": card.get("created_at"),
            "face_probabilities": str(args.face_probabilities),
            "n_face_images": int(len(probs.labels)),
            "n_catalog_products": n_catalog,
            "n_users": {"val": int(splits["val"].n_groups), "test": int(splits["eval_candidates"].n_groups)},
            "alphas": {norm: alphas_for(norm) for norm in hybrid.PREFERENCE_NORMS},
            "gamma_bounds": [GAMMA_LOW, GAMMA_HIGH],
        },
        "selection": {
            "scenario": SELECTION_SCENARIO,
            "metric": f"val mean group {SELECTION_METRIC}",
            "tie_rule": "larger alpha, then norm none",
            "norm": norm_star,
            "alpha": alpha_star,
            "beta": round(1.0 - alpha_star, 3),
            "val_ndcg@10": val_curve[(norm_star, alpha_star)],
            "fallback": fallback,
        },
        "comparison": {"norm": norm_cmp, "alpha": alpha_cmp, "val_ndcg@10": val_curve[(norm_cmp, alpha_cmp)], "is_selected": not fallback},
        "val_pref_only": val_curve[(norm_star, 1.0)],
        "val_curve": {norm: {alpha_text(a): val_curve[(norm, a)] for a in alphas_for(norm)} for norm in hybrid.PREFERENCE_NORMS},
        "test_curve": {norm: {alpha_text(a): test_curve[(norm, a)] for a in alphas_for(norm)} for norm in hybrid.PREFERENCE_NORMS},
        "test_curve_best": {"norm": test_best_norm, "alpha": test_best_alpha, "ndcg@10": test_curve[(test_best_norm, test_best_alpha)]},
        "significance": significance,
        "segment_order": segment_order,
        "gamma_segments": segments,
        "service_before": {
            "norm": SERVICE_BEFORE[0],
            "alpha": SERVICE_BEFORE[1],
            "test_ndcg@10": test_curve[SERVICE_BEFORE],
            "test_pref_only": test_curve[(SERVICE_BEFORE[0], 1.0)],
            "test_facefit_only": test_curve[(SERVICE_BEFORE[0], 0.0)],
            "test_pref_median": float(np.median(splits["eval_candidates"].pref["none"])),
        },
        "val_best_per_norm": {
            norm: {"alpha": alpha, "val_ndcg@10": val_curve[(norm, alpha)]}
            for norm, alpha in (select_config({k: v for k, v in val_curve.items() if k[0] == n}) for n in hybrid.PREFERENCE_NORMS)
        },
        "service_default": service_default,
        "facefit_top10": {
            "pref_only": mean_metric(pref_result, f"mean_facefit@{TOP_K}"),
            "config": mean_metric(cmp_result, f"mean_facefit@{TOP_K}"),
            "div_pref_only": mean_metric(pref_result, f"diversity@{TOP_K}"),
            "div_config": mean_metric(cmp_result, f"diversity@{TOP_K}"),
        },
    }

    args.reports_dir.mkdir(parents=True, exist_ok=True)
    val_rows = table_rows(val, masks["val"], args.seed)
    test_rows = table_rows(test, test_masks, args.seed)
    write_rows(val_rows, args.reports_dir / "results_val.csv")
    write_rows(test_rows, args.reports_dir / "results_test.csv")
    write_json(report, args.reports_dir / "results.json")
    write_summary(report, cells_of(test_rows), val_curve, test_curve, args.reports_dir / "SUMMARY.md")
    plot_figures(report, val, test, test_masks, args.reports_dir / "figures")
    print(
        f"selected norm={norm_star} alpha={alpha_star:g} beta={round(1.0 - alpha_star, 3):g} "
        f"(val NDCG@10 {val_curve[(norm_star, alpha_star)]:.4f}); wrote {args.reports_dir} in {time.monotonic() - started:.1f}s"
    )


if __name__ == "__main__":
    main()
