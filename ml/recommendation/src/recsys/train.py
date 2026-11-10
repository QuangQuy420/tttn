"""Step `make train`: fit + tune the PreferenceScore models on train, select on val (plan 10, T4).

Reads ONLY `train.parquet` and `val.parquet` of `--dataset-dir` (test is for `recsys.evaluate`).
Inputs = the 63 columns of `app.ml.features.feature_names()` as a float32 ndarray (never a
DataFrame, same as serving).

- Models: Logistic Regression (StandardScaler, balanced classes), Random Forest, XGBoost binary
  (`binary:logistic`) - binary target `label >= 2` - and XGBoost ranker (`rank:ndcg`, `qid =
  group_id`, graded labels 0-4). Small fixed grids, NO early stopping; one `--seed` for every
  estimator.
- Every candidate (and the baselines) is scored by mean val-group NDCG@10 (1 positive + 20
  sampled negatives: a sampled metric, used ONLY for tuning and selection) through
  `app.ml.preference.raw_score`. Best primary model = highest val NDCG@10.
- Calibration: sigmoid (Platt) on the val raw score with target `label >= threshold`, stored as
  `{method, a, b, raw_score, fitted_on}` (no calibrator file).
- Ablation (AC12): the best binary family re-fit with `label >= 1` and `label >= 3` (same
  params, own calibration); never eligible for export.
- Optional ALS baseline when `implicit` is importable (otherwise a printed note).

Outputs in `--models-dir` (default `data/models/`): `<name>/model.joblib` (the fitted sklearn-API
estimator only; `als/model.joblib` = factors + id maps) and `val_results.json`.
"""
from __future__ import annotations

import argparse
import itertools
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.ml import features, preference
from recsys import baselines, metrics
from recsys.common import DATASET_META_JSON, fail, read_json, write_json

MODEL_FILE = "model.joblib"
VAL_RESULTS_JSON = "val_results.json"
PRIMARY_LABEL_MIN = 2
ABLATION_LABEL_MINS = (1, 3)
VAL_K = 10
CALIBRATION_C = 1e6

# family -> (raw_score kind, objective, grid). Grids stay small (CPU, a few minutes) and keep
# the artifacts < 5 MB (RF depth / tree count, XGBoost trees).
FAMILIES: dict[str, dict[str, Any]] = {
    "lr": {"raw_score": "decision_function", "objective": "binary", "grid": {"C": [0.01, 0.1, 1.0]}},
    "rf": {
        "raw_score": "predict_proba_1",
        "objective": "binary",
        "grid": {"n_estimators": [100, 200], "max_depth": [6, 8], "min_samples_leaf": [50]},
    },
    "xgb": {
        "raw_score": "margin",
        "objective": "binary:logistic",
        "grid": {"n_estimators": [100, 300], "max_depth": [4, 6]},
    },
    "xgbrank": {
        "raw_score": "margin",
        "objective": "rank:ndcg",
        "grid": {"n_estimators": [100, 300], "max_depth": [4, 6]},
    },
}
BINARY_FAMILIES = ("lr", "rf", "xgb")
XGB_FIXED = {"learning_rate": 0.05, "subsample": 0.8, "colsample_bytree": 0.8, "tree_method": "hist"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset-dir", type=Path, default=Path("data/sim/dataset"))
    parser.add_argument("--models-dir", type=Path, default=Path("data/models"))
    parser.add_argument("--seed", type=int, default=42, help="seed of every estimator / sampler")
    return parser


def load_split(dataset_dir: Path, split: str) -> pd.DataFrame:
    """One dataset parquet; fails on a feature schema mismatch or a missing feature column."""
    meta = read_json(dataset_dir / DATASET_META_JSON)
    if meta is None:
        fail(f"{dataset_dir / DATASET_META_JSON} not found - run `make all CATALOG_SOURCE=seed` first")
    if meta.get("feature_schema_version") != features.FEATURE_SCHEMA_VERSION:
        fail(
            f"{dataset_dir} has feature_schema_version={meta.get('feature_schema_version')!r}, "
            f"code has {features.FEATURE_SCHEMA_VERSION!r} - rebuild the dataset"
        )
    path = dataset_dir / f"{split}.parquet"
    if not path.is_file():
        fail(f"{path} not found")
    frame = pd.read_parquet(path)
    missing = [name for name in features.feature_names() if name not in frame.columns]
    if missing:
        fail(f"{path} is missing feature columns {missing}")
    return frame


def feature_matrix(frame: pd.DataFrame) -> np.ndarray:
    """(n, 63) float32 in `feature_names()` order."""
    return np.ascontiguousarray(frame[features.feature_names()].to_numpy(dtype=np.float32))


def label_definition(objective: str, label_min: int) -> str:
    return "graded 0-4" if objective.startswith("rank:") else f"label >= {label_min}"


def make_estimator(family: str, params: dict[str, Any], seed: int):
    if family == "lr":
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler

        return make_pipeline(
            StandardScaler(),
            LogisticRegression(class_weight="balanced", max_iter=2000, random_state=seed, **params),
        )
    if family == "rf":
        from sklearn.ensemble import RandomForestClassifier

        return RandomForestClassifier(random_state=seed, n_jobs=-1, **params)
    if family == "xgb":
        from xgboost import XGBClassifier

        return XGBClassifier(objective="binary:logistic", random_state=seed, n_jobs=-1, **XGB_FIXED, **params)
    if family == "xgbrank":
        from xgboost import XGBRanker

        return XGBRanker(objective="rank:ndcg", random_state=seed, n_jobs=-1, **XGB_FIXED, **params)
    raise ValueError(f"unknown family {family!r}")


def full_params(family: str, params: dict[str, Any]) -> dict[str, Any]:
    """The tuned params plus the fixed ones (stored in val_results / the model card)."""
    if family == "lr":
        return {"C": params["C"], "class_weight": "balanced", "max_iter": 2000, "scaler": "StandardScaler"}
    if family in ("xgb", "xgbrank"):
        return {**XGB_FIXED, **params}
    return dict(params)


def fit(family: str, params: dict[str, Any], seed: int, X: np.ndarray, frame: pd.DataFrame, label_min: int):
    estimator = make_estimator(family, params, seed)
    labels = frame["label"].to_numpy()
    if family == "xgbrank":
        # Rows are already in group_id order (no shuffle) - required by `qid`.
        estimator.fit(X, labels.astype(np.int32), qid=frame["group_id"].to_numpy())
    else:
        estimator.fit(X, (labels >= label_min).astype(np.int32))
    return estimator


def val_ndcg(scores: np.ndarray, val: pd.DataFrame) -> float:
    return metrics.mean_group_ndcg(
        val["group_id"].to_numpy(), val["label"].to_numpy(), scores, val["product_id"].to_numpy(), k=VAL_K
    )


def fit_calibration(raw: np.ndarray, target: np.ndarray, raw_score_kind: str) -> dict[str, Any]:
    """Platt sigmoid on the 1-D raw score: `preference = 1 / (1 + exp(-(a*s + b)))`."""
    from sklearn.linear_model import LogisticRegression

    platt = LogisticRegression(C=CALIBRATION_C, max_iter=1000)
    platt.fit(raw.reshape(-1, 1), target.astype(np.int32))
    return {
        "method": preference.CALIBRATION_METHOD,
        "a": float(platt.coef_[0, 0]),
        "b": float(platt.intercept_[0]),
        "raw_score": raw_score_kind,
        "fitted_on": "val",
    }


def tune(family: str, seed: int, X_train: np.ndarray, train: pd.DataFrame, X_val: np.ndarray, val: pd.DataFrame):
    """Best (estimator, params, val NDCG@10) of the family's grid."""
    spec = FAMILIES[family]
    keys = list(spec["grid"])
    best: tuple[Any, dict[str, Any], float] | None = None
    for values in itertools.product(*(spec["grid"][key] for key in keys)):
        params = dict(zip(keys, values))
        started = time.monotonic()
        estimator = fit(family, params, seed, X_train, train, PRIMARY_LABEL_MIN)
        score = val_ndcg(preference.raw_score(estimator, spec["raw_score"], X_val), val)
        print(f"  {family} {params}: val NDCG@{VAL_K} = {score:.4f} ({time.monotonic() - started:.1f}s)")
        if best is None or score > best[2]:
            best = (estimator, params, score)
    assert best is not None
    return best


def save_model(model: Any, models_dir: Path, name: str) -> None:
    import joblib

    path = models_dir / name / MODEL_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path, compress=3)


def model_entry(
    val_score: float,
    params: dict[str, Any],
    calibration: dict[str, Any] | None,
    primary: bool,
    label_def: str | None,
    objective: str,
) -> dict[str, Any]:
    return {
        "val_ndcg@10": val_score,
        "params": params,
        "calibration": calibration,
        "primary": primary,
        "label_definition": label_def,
        "objective": objective,
    }


def main() -> None:
    args = build_parser().parse_args()
    started = time.monotonic()
    train = load_split(args.dataset_dir, "train")
    val = load_split(args.dataset_dir, "val")
    X_train, X_val = feature_matrix(train), feature_matrix(val)
    val_labels = val["label"].to_numpy()
    print(f"train: {len(train)} rows / val: {len(val)} rows, {X_train.shape[1]} features, seed {args.seed}")

    results: dict[str, dict[str, Any]] = {}
    for name, score_fn in baselines.BASELINES.items():
        score = val_ndcg(score_fn(val), val)
        results[name] = model_entry(score, {}, None, False, None, "fixed formula")
        print(f"baseline {name}: val NDCG@{VAL_K} = {score:.4f}")

    if baselines.implicit_available():
        als = baselines.fit_als(train, args.seed)
        score = val_ndcg(als.score(val), val)
        save_model(als, args.models_dir, "als")
        results["als"] = model_entry(score, dict(baselines.ALS_PARAMS), None, False, "label >= 1", "als")
        print(f"baseline als: val NDCG@{VAL_K} = {score:.4f}")
    else:
        print("note: `implicit` is not installed - ALS baseline skipped (optional)")

    chosen: dict[str, dict[str, Any]] = {}
    for family, spec in FAMILIES.items():
        print(f"tuning {family} ...")
        estimator, params, score = tune(family, args.seed, X_train, train, X_val, val)
        raw = preference.raw_score(estimator, spec["raw_score"], X_val)
        calibration = fit_calibration(raw, val_labels >= PRIMARY_LABEL_MIN, spec["raw_score"])
        save_model(estimator, args.models_dir, family)
        chosen[family] = params
        results[family] = model_entry(
            score,
            full_params(family, params),
            calibration,
            True,
            label_definition(spec["objective"], PRIMARY_LABEL_MIN),
            spec["objective"],
        )

    best_binary = max(BINARY_FAMILIES, key=lambda family: results[family]["val_ndcg@10"])
    spec = FAMILIES[best_binary]
    for label_min in ABLATION_LABEL_MINS:
        name = f"{best_binary}_ge{label_min}"
        estimator = fit(best_binary, chosen[best_binary], args.seed, X_train, train, label_min)
        raw = preference.raw_score(estimator, spec["raw_score"], X_val)
        calibration = fit_calibration(raw, val_labels >= label_min, spec["raw_score"])
        save_model(estimator, args.models_dir, name)
        results[name] = model_entry(
            val_ndcg(raw, val),
            full_params(best_binary, chosen[best_binary]),
            calibration,
            False,
            label_definition(spec["objective"], label_min),
            spec["objective"],
        )
        print(f"ablation {name}: val NDCG@{VAL_K} = {results[name]['val_ndcg@10']:.4f}")

    best = max((name for name, entry in results.items() if entry["primary"]), key=lambda name: results[name]["val_ndcg@10"])
    write_json({"models": results, "best": best, "seed": args.seed}, args.models_dir / VAL_RESULTS_JSON)
    print(f"best primary model: {best} (val NDCG@{VAL_K} = {results[best]['val_ndcg@10']:.4f})")
    print(f"wrote {args.models_dir} in {time.monotonic() - started:.1f}s")


if __name__ == "__main__":
    main()
