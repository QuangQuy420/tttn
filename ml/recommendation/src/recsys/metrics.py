"""Top-K ranking metrics for the PreferenceScore model (plan 10, T2).

One ranking group = one user's candidate rows (`group_id`). Inside a group, rows are ranked by
score descending, ties broken by `product_id` ascending. `R_u` = rows with a graded label >=
`relevant_min` (default 1); groups with an empty `R_u` are skipped.

- `Precision@K = |topK ∩ R_u| / K`, `Recall@K = |topK ∩ R_u| / |R_u|`,
  `HitRate@K = 1[|topK ∩ R_u| > 0]`.
- `NDCG@K = DCG@K / IDCG@K`, `DCG@K = sum_{i=1..K} (2^rel_i - 1) / log2(i + 1)`, `rel` = graded
  label; IDCG ranks the group's own labels ideally.

The functions are general (any `|R_u|`). With the leave-last-out split `|R_u| = 1`, so
Recall@K = HitRate@K and Precision@K = HitRate@K / K. Used for the full-ranking test
(`eval_candidates`) and the sampled val groups (tuning only).
"""
from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

KS: tuple[int, ...] = (5, 10)
METRIC_KINDS: tuple[str, ...] = ("precision", "recall", "hitrate", "ndcg")


def metric_names(ks: Sequence[int] = KS) -> list[str]:
    """`precision@5, recall@5, hitrate@5, ndcg@5, precision@10, ...`."""
    return [f"{kind}@{k}" for k in ks for kind in METRIC_KINDS]


def ranked(group_ids: np.ndarray, labels: np.ndarray, scores: np.ndarray, product_ids: np.ndarray) -> pd.DataFrame:
    """Rows sorted by (group, score desc, product_id asc) with a 1-based `rank` per group."""
    frame = pd.DataFrame(
        {
            "group_id": np.asarray(group_ids),
            "label": np.asarray(labels, dtype=np.int64),
            "score": np.asarray(scores, dtype=np.float64),
            "product_id": np.asarray(product_ids),
            "row": np.arange(len(group_ids)),
        }
    )
    frame = frame.sort_values(["group_id", "score", "product_id"], ascending=[True, False, True], kind="mergesort")
    frame["rank"] = frame.groupby("group_id", sort=False).cumcount() + 1
    return frame.reset_index(drop=True)


def per_user_metrics(
    group_ids: np.ndarray,
    labels: np.ndarray,
    scores: np.ndarray,
    product_ids: np.ndarray,
    ks: Sequence[int] = KS,
    relevant_min: int = 1,
) -> pd.DataFrame:
    """One row per group with a non-empty `R_u` (index = group_id), columns `metric_names(ks)`."""
    frame = ranked(group_ids, labels, scores, product_ids)
    frame["relevant"] = (frame["label"] >= relevant_min).astype(np.float64)
    frame["gain"] = np.exp2(frame["label"].to_numpy(dtype=np.float64)) - 1.0
    frame["discount"] = 1.0 / np.log2(frame["rank"].to_numpy(dtype=np.float64) + 1.0)
    # Ideal order = labels sorted descending inside the group.
    ideal_gain = np.exp2(
        frame.sort_values(["group_id", "label"], ascending=[True, False], kind="mergesort")["label"].to_numpy(dtype=np.float64)
    ) - 1.0
    frame["ideal_dcg_term"] = ideal_gain * frame["discount"].to_numpy()

    grouped = frame.groupby("group_id", sort=True)
    n_relevant = grouped["relevant"].sum()
    out = pd.DataFrame(index=n_relevant.index)
    for k in ks:
        top = frame["rank"] <= k
        hits = frame["relevant"].where(top, 0.0).groupby(frame["group_id"]).sum()
        dcg = (frame["gain"] * frame["discount"]).where(top, 0.0).groupby(frame["group_id"]).sum()
        idcg = frame["ideal_dcg_term"].where(top, 0.0).groupby(frame["group_id"]).sum()
        out[f"precision@{k}"] = hits / k
        out[f"recall@{k}"] = hits / n_relevant.where(n_relevant > 0)
        out[f"hitrate@{k}"] = (hits > 0).astype(np.float64)
        out[f"ndcg@{k}"] = dcg / idcg.where(idcg > 0)
    out = out[n_relevant > 0]
    return out[metric_names(ks)]


def mean_group_ndcg(
    group_ids: np.ndarray, labels: np.ndarray, scores: np.ndarray, product_ids: np.ndarray, k: int = 10
) -> float:
    """Mean NDCG@k over groups with a relevant row (the val tuning / selection metric)."""
    per_user = per_user_metrics(group_ids, labels, scores, product_ids, ks=(k,))
    return float(per_user[f"ndcg@{k}"].mean()) if len(per_user) else 0.0


def bootstrap_ci(
    per_user: pd.DataFrame, n_resamples: int = 1000, seed: int = 42, alpha: float = 0.05
) -> dict[str, dict[str, float]]:
    """`{metric: {mean, ci_low, ci_high}}`: users resampled with replacement, percentile interval."""
    values = per_user.to_numpy(dtype=np.float64)
    n_users = values.shape[0]
    if n_users == 0:
        return {name: {"mean": float("nan"), "ci_low": float("nan"), "ci_high": float("nan")} for name in per_user.columns}
    rng = np.random.default_rng(seed)
    means = np.empty((n_resamples, values.shape[1]))
    for i in range(n_resamples):
        means[i] = values[rng.integers(0, n_users, size=n_users)].mean(axis=0)
    low = np.percentile(means, 100 * alpha / 2, axis=0)
    high = np.percentile(means, 100 * (1 - alpha / 2), axis=0)
    point = values.mean(axis=0)
    return {
        name: {"mean": float(point[j]), "ci_low": float(low[j]), "ci_high": float(high[j])}
        for j, name in enumerate(per_user.columns)
    }


def top_k(group_ids: np.ndarray, scores: np.ndarray, product_ids: np.ndarray, k: int) -> pd.DataFrame:
    """The top-k rows of every group (`group_id, product_id, rank, row` = position in the input)."""
    frame = ranked(group_ids, np.zeros(len(group_ids), dtype=np.int64), scores, product_ids)
    return frame.loc[frame["rank"] <= k, ["group_id", "product_id", "rank", "row"]].reset_index(drop=True)


def coverage_at_k(group_ids: np.ndarray, scores: np.ndarray, product_ids: np.ndarray, k: int, n_catalog: int) -> float:
    """Share of the catalog that appears in at least one user's top-k."""
    if n_catalog <= 0:
        return 0.0
    return float(top_k(group_ids, scores, product_ids, k)["product_id"].nunique() / n_catalog)
