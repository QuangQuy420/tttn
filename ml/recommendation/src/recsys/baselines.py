"""Non-learned baselines for the PreferenceScore comparison (plan 10, T3).

Common interface: `score(frame) -> np.ndarray` (float64, one value per row), where `frame` is a
dataset parquet read as a DataFrame (`user_id, product_id, ..., <63 feature columns>`).

- Popularity: `p_log_pop` (= log1p of the decayed popularity at the row's `ts`).
- Content-based: mean of `x_cos_shape, x_cos_material, x_color_affinity, x_brand_affinity` and
  `price_fit = 1 - min(x_price_abs_z, 3) / 3` (fixed formula over existing columns, no new
  feature code).
- ALS (optional): `implicit.als.AlternatingLeastSquares` on the train positives with confidence
  `1 + alpha * label` (Hu-Koren-Volinsky). Skipped when `implicit` is not importable; never
  exported (seed-catalog item ids do not transfer to the real catalog).
"""
from __future__ import annotations

import inspect
from dataclasses import dataclass

import numpy as np
import pandas as pd

CONTENT_COLUMNS = ("x_cos_shape", "x_cos_material", "x_color_affinity", "x_brand_affinity")
PRICE_ABS_Z_CAP = 3.0
ALS_PARAMS = {"factors": 32, "regularization": 0.05, "iterations": 20, "alpha": 10.0}


def popularity_score(frame: pd.DataFrame) -> np.ndarray:
    return frame["p_log_pop"].to_numpy(dtype=np.float64)


def content_score(frame: pd.DataFrame) -> np.ndarray:
    price_fit = 1.0 - np.minimum(frame["x_price_abs_z"].to_numpy(dtype=np.float64), PRICE_ABS_Z_CAP) / PRICE_ABS_Z_CAP
    parts = [frame[column].to_numpy(dtype=np.float64) for column in CONTENT_COLUMNS] + [price_fit]
    return np.mean(np.vstack(parts), axis=0)


BASELINES = {"popularity": popularity_score, "content": content_score}


def implicit_available() -> bool:
    try:
        import implicit.als  # noqa: F401
    except ImportError:
        return False
    return True


@dataclass
class AlsBaseline:
    """User/item factors + id maps; unknown users/items score 0."""

    user_index: dict[str, int]
    item_index: dict[str, int]
    user_factors: np.ndarray
    item_factors: np.ndarray

    def score(self, frame: pd.DataFrame) -> np.ndarray:
        users = frame["user_id"].map(self.user_index).fillna(-1).to_numpy(dtype=np.int64)
        items = frame["product_id"].map(self.item_index).fillna(-1).to_numpy(dtype=np.int64)
        known = (users >= 0) & (items >= 0)
        scores = np.zeros(len(frame), dtype=np.float64)
        scores[known] = np.einsum("ij,ij->i", self.user_factors[users[known]], self.item_factors[items[known]])
        return scores


def fit_als(train: pd.DataFrame, seed: int) -> AlsBaseline:
    """ALS on the train positives (label >= 1); one thread + `random_state` for repeatability."""
    from implicit.als import AlternatingLeastSquares
    from scipy.sparse import csr_matrix

    positives = train[train["label"] > 0]
    user_ids = sorted(positives["user_id"].unique())
    item_ids = sorted(positives["product_id"].unique())
    user_index = {u: i for i, u in enumerate(user_ids)}
    item_index = {p: i for i, p in enumerate(item_ids)}
    rows = positives["user_id"].map(user_index).to_numpy()
    cols = positives["product_id"].map(item_index).to_numpy()
    # The matrix value is the confidence itself; implicit >= 0.6 also scales it by `alpha`, kept at 1.
    confidence = 1.0 + ALS_PARAMS["alpha"] * positives["label"].to_numpy(dtype=np.float32)
    user_items = csr_matrix((confidence, (rows, cols)), shape=(len(user_ids), len(item_ids)), dtype=np.float32)

    kwargs = {
        "factors": ALS_PARAMS["factors"],
        "regularization": ALS_PARAMS["regularization"],
        "iterations": ALS_PARAMS["iterations"],
        "random_state": seed,
        "num_threads": 1,
    }
    accepted = inspect.signature(AlternatingLeastSquares).parameters
    if "alpha" in accepted:
        kwargs["alpha"] = 1.0
    if "use_gpu" in accepted:
        kwargs["use_gpu"] = False
    model = AlternatingLeastSquares(**kwargs)
    model.fit(user_items, show_progress=False)
    return AlsBaseline(
        user_index=user_index,
        item_index=item_index,
        user_factors=np.asarray(model.user_factors, dtype=np.float64),
        item_factors=np.asarray(model.item_factors, dtype=np.float64),
    )
