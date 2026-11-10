"""PreferenceScore (AI 2): raw model score → calibrated preference in (0, 1).

The single scoring path for training/evaluation (`ml/recommendation`, imported through
`PYTHONPATH`) AND serving (this service, later) — so both turn a model into the same
number. Numpy only and duck-typed: no sklearn / xgboost import here.

- `raw_score` picks the model's raw output by `calibration["raw_score"]`:
  `decision_function` (LR pipeline), `predict_proba_1` (RF, `predict_proba[:, 1]`) or
  `margin` (XGBoost binary and ranker; the sklearn wrapper offline or a raw
  `xgboost.Booster` in serving).
- `calibrate` applies the sigmoid (Platt) fitted on val:
  `preference = 1 / (1 + exp(-(a * s + b)))`. Strictly monotonic, so ranking is unchanged.
  Probabilities are relative to the sampled 1:20 negative ratio, not real prevalence.

`X` is a float32 ndarray of shape (n, n_features) in `features.feature_names()` order —
never a DataFrame, so train and serve get the same input.
"""
from collections.abc import Mapping
from typing import Any

import numpy as np

RAW_SCORE_KINDS: tuple[str, ...] = ("decision_function", "predict_proba_1", "margin")
CALIBRATION_METHOD = "sigmoid"
_Z_CLIP = 30.0


def raw_score(model: Any, raw_score_kind: str, X: np.ndarray) -> np.ndarray:
    """The model's raw score for each row of `X`, as float64 of shape (n,)."""
    if raw_score_kind not in RAW_SCORE_KINDS:
        raise ValueError(f"unknown raw_score kind: {raw_score_kind!r}")
    if not isinstance(X, np.ndarray) or X.ndim != 2:
        raise ValueError("X must be a 2-D np.ndarray")

    if raw_score_kind == "decision_function":
        scores = model.decision_function(X)
    elif raw_score_kind == "predict_proba_1":
        scores = np.asarray(model.predict_proba(X))[:, 1]
    else:
        booster = model.get_booster() if hasattr(model, "get_booster") else model
        scores = booster.inplace_predict(X, predict_type="margin")

    scores = np.asarray(scores, dtype=np.float64)
    if scores.shape != (X.shape[0],):
        raise ValueError(f"raw score shape {scores.shape} != ({X.shape[0]},)")
    return scores


def _check_method(calibration: Mapping[str, Any]) -> None:
    method = calibration.get("method")
    if method != CALIBRATION_METHOD:
        raise ValueError(f"unsupported calibration method: {method!r}")


def calibrate(raw: np.ndarray, calibration: Mapping[str, Any]) -> np.ndarray:
    """Sigmoid (Platt) of the raw scores, as float64 of shape (n,) strictly inside (0, 1)."""
    _check_method(calibration)
    a = float(calibration["a"])
    b = float(calibration["b"])
    z = np.clip(a * np.asarray(raw, dtype=np.float64).reshape(-1) + b, -_Z_CLIP, _Z_CLIP)
    return 1.0 / (1.0 + np.exp(-z))


def predict_preference(model: Any, calibration: Mapping[str, Any], X: np.ndarray) -> np.ndarray:
    """PreferenceScore in (0, 1) for each row of `X`: `raw_score` then `calibrate`."""
    _check_method(calibration)
    return calibrate(raw_score(model, calibration.get("raw_score"), X), calibration)
