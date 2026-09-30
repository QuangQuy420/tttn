"""Shared training helpers for plan 07 (used by tune / calibrate / evaluate / ablation / export).

Models (AC3, AC10):
- `svm`: `Pipeline(StandardScaler, SVC(rbf, class_weight="balanced"))` - probability stays at its
  default False (sklearn 1.9 deprecates passing `probability`); calibrate.py calibrates instead;
- `rf`: `RandomForestClassifier(class_weight="balanced_subsample")`;
- `xgb`: `XGBClassifier(multi:softprob)` on label-encoded targets with balanced `sample_weight`,
  only when `import xgboost` works (otherwise reported as "chưa làm / not installed").

X = the 20 `FEATURE_NAMES` columns of `processed/features.parquet` (in that order), y = `label`,
rows selected by `processed/splits.csv` (joined on `image_id`). Only the requested splits are read
from the parquet, so tuning never loads a test row.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.ml.face_features import FEATURE_NAMES, FEATURE_SCHEMA_VERSION
from faceshape.common import DataPaths, fail, require_file

TRAINED_ALGOS = ("svm", "rf", "xgb")
ALGO_NAMES = {
    "rule_v0": "Rule v0 (production)",
    "rule_v1_literature": "Rule v1 (literature)",
    "rule_v1_fitted": "Rule v1 (fitted)",
    "svm": "SVM (RBF)",
    "rf": "Random Forest",
    "xgb": "XGBoost",
}
XGB_NOT_INSTALLED = "chưa làm - xgboost not installed"


def xgboost_available() -> bool:
    try:
        import xgboost  # noqa: F401
    except ImportError:
        return False
    return True


def available_algos() -> list[str]:
    return [algo for algo in TRAINED_ALGOS if algo != "xgb" or xgboost_available()]


def build_estimator(algo: str, seed: int) -> Any:
    """Untuned estimator for `algo`; GridSearchCV sets the grid params on top."""
    if algo == "svm":
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.svm import SVC

        return Pipeline(
            [("scale", StandardScaler()), ("clf", SVC(kernel="rbf", class_weight="balanced"))]
        )
    if algo == "rf":
        from sklearn.ensemble import RandomForestClassifier

        return RandomForestClassifier(class_weight="balanced_subsample", random_state=seed)
    if algo == "xgb":
        from xgboost import XGBClassifier

        return XGBClassifier(objective="multi:softprob", tree_method="hist", random_state=seed, n_jobs=1)
    raise ValueError(f"Unknown algorithm {algo!r}.")


def encode_target(algo: str, y: np.ndarray, label_order: list[str]) -> np.ndarray:
    """XGBoost needs integer targets 0..k-1: index into `label_order` (sorted class names, the
    order sklearn uses for string labels). Other algorithms keep the string labels."""
    if algo != "xgb":
        return y
    return np.searchsorted(np.asarray(label_order), y)


def fit_params(algo: str, y: np.ndarray) -> dict[str, Any]:
    """Balanced per-sample weights for XGBoost (SVM/RF use `class_weight` instead)."""
    if algo != "xgb":
        return {}
    from sklearn.utils.class_weight import compute_sample_weight

    return {"sample_weight": compute_sample_weight("balanced", y)}


def class_names(model: Any, label_order: list[str]) -> list[str]:
    """Class names in `predict_proba` column order (maps XGBoost's integer classes back)."""
    classes = np.asarray(model.classes_)
    if np.issubdtype(classes.dtype, np.integer):
        return [label_order[int(c)] for c in classes]
    return [str(c) for c in classes]


def label_order(config: dict[str, Any]) -> list[str]:
    return sorted(config["classes"])


def cv_splitter(n_splits: int, seed: int) -> Any:
    from sklearn.model_selection import StratifiedGroupKFold

    return StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)


def cv_folds(config: dict[str, Any], override: int | None) -> int:
    return int(override) if override else int(config["training"]["cv_folds"])


def load_dataset(paths: DataPaths, splits: tuple[str, ...]) -> pd.DataFrame:
    """Feature rows of the given splits only (with `split` and `person_id`), in `splits.csv` order."""
    require_file(paths.features_parquet, "Run `make features` first.")
    require_file(paths.splits_csv, "Run `make split` first.")
    split_df = pd.read_csv(paths.splits_csv, dtype={"image_id": str, "person_id": str})
    split_df = split_df[split_df["split"].isin(splits)]
    ids = split_df["image_id"].tolist()
    features = pd.read_parquet(paths.features_parquet, filters=[("image_id", "in", ids)])
    versions = set(features["feature_schema_version"].astype(str))
    if versions != {FEATURE_SCHEMA_VERSION}:
        fail(f"features.parquet has feature_schema_version {sorted(versions)}, expected {FEATURE_SCHEMA_VERSION}. Re-run `make features`.")
    df = split_df[["image_id", "split"]].merge(features, on="image_id", how="inner", validate="one_to_one")
    if len(df) != len(split_df):
        fail(f"{len(split_df) - len(df)} split rows have no features - re-run `make features split`.")
    return df.reset_index(drop=True)


def xy(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    return df[list(FEATURE_NAMES)].to_numpy(dtype=np.float64), df["label"].to_numpy(dtype=str)


def tuning_path(out_dir: Path) -> Path:
    return out_dir / "tuning.json"


def load_tuning(out_dir: Path) -> dict[str, Any]:
    path = tuning_path(out_dir)
    require_file(path, "Run `make train` first.")
    return json.loads(path.read_text(encoding="utf-8"))


def model_path(paths: DataPaths, algo: str) -> Path:
    return paths.models / f"{algo}_calibrated.joblib"


def best_algo(tuning: dict[str, Any]) -> str:
    """Q1: the final model is the trained algorithm with the highest CV macro-F1 (never test)."""
    scores = {algo: res["cv_macro_f1"] for algo, res in tuning["algos"].items() if res.get("cv_macro_f1") is not None}
    scores = {algo: s for algo, s in scores.items() if np.isfinite(s)}
    if not scores:
        fail("No trained algorithm has a finite CV macro-F1 in tuning.json.")
    return max(scores, key=scores.get)
