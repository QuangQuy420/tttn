"""Unit tests for the PreferenceScore helper (`app.ml.preference`) — pure functions with
tiny duck-typed fake models (no sklearn / xgboost). Expected values are computed by hand
from the plan's Design section (`.planning/2026-09-29-10-preference-model-training.md`,
"Calibration → Preference"): `preference = 1 / (1 + exp(-(a * s + b)))`.
"""
import math

import numpy as np
import pytest

from app.ml.preference import calibrate, predict_preference, raw_score

X = np.array([[1.0, 2.0], [3.0, 4.0], [0.0, -1.0]], dtype=np.float32)
ROW_SUMS = [3.0, 7.0, -1.0]


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


class _DecisionModel:
    """LR-pipeline-like: `decision_function` = row sum."""

    def decision_function(self, X: np.ndarray) -> np.ndarray:
        return X.sum(axis=1)


class _ProbaModel:
    """RF-like: `predict_proba` with column 1 = 0.1 * row index."""

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        p1 = np.arange(X.shape[0]) * 0.1
        return np.column_stack([1.0 - p1, p1])


class _Booster:
    """Raw `xgboost.Booster`-like: `inplace_predict` margin = row sum; records the call."""

    def __init__(self) -> None:
        self.predict_types: list[str] = []

    def inplace_predict(self, X: np.ndarray, predict_type: str = "value") -> np.ndarray:
        self.predict_types.append(predict_type)
        return X.sum(axis=1)


class _SklearnXgbWrapper:
    """XGBClassifier/XGBRanker-like: exposes the booster through `get_booster()`."""

    def __init__(self, booster: _Booster) -> None:
        self._booster = booster

    def get_booster(self) -> _Booster:
        return self._booster


def test_calibrate_is_inside_open_unit_interval_and_keeps_order_ac7() -> None:
    raw = np.array([-1e6, -50.0, -2.0, 0.0, 0.5, 3.0, 50.0, 1e6])
    out = calibrate(raw, {"method": "sigmoid", "a": 2.0, "b": -1.0})

    assert out.dtype == np.float64
    assert out.shape == (8,)
    assert np.all(out > 0.0) and np.all(out < 1.0)
    assert np.all(np.diff(out) >= 0.0)
    # Moderate values are strictly increasing and match the hand-computed sigmoid.
    assert np.all(np.diff(out[2:6]) > 0.0)
    assert out[2:6].tolist() == pytest.approx(
        [_sigmoid(-5.0), _sigmoid(-1.0), _sigmoid(0.0), _sigmoid(5.0)]
    )


def test_calibrate_with_negative_slope_reverses_order_ac7() -> None:
    out = calibrate(np.array([-1.0, 0.0, 1.0]), {"method": "sigmoid", "a": -1.0, "b": 0.0})

    assert out.tolist() == pytest.approx([_sigmoid(1.0), 0.5, _sigmoid(-1.0)])


def test_raw_score_dispatches_by_kind_ac7() -> None:
    assert raw_score(_DecisionModel(), "decision_function", X).tolist() == pytest.approx(ROW_SUMS)
    assert raw_score(_ProbaModel(), "predict_proba_1", X).tolist() == pytest.approx([0.0, 0.1, 0.2])

    wrapped = _Booster()
    out = raw_score(_SklearnXgbWrapper(wrapped), "margin", X)
    assert out.dtype == np.float64
    assert out.tolist() == pytest.approx(ROW_SUMS)
    assert wrapped.predict_types == ["margin"]

    bare = _Booster()
    assert raw_score(bare, "margin", X).tolist() == pytest.approx(ROW_SUMS)
    assert bare.predict_types == ["margin"]


def test_predict_preference_scores_then_calibrates_ac7_ac9() -> None:
    calibration = {"method": "sigmoid", "a": 0.5, "b": -1.0, "raw_score": "margin", "fitted_on": "val"}

    out = predict_preference(_SklearnXgbWrapper(_Booster()), calibration, X)

    assert out.shape == (3,)
    assert out.tolist() == pytest.approx([_sigmoid(0.5 * s - 1.0) for s in ROW_SUMS])


@pytest.mark.parametrize(
    "calibration",
    [
        {"method": "sigmoid", "a": 1.0, "b": 0.0, "raw_score": "predict"},
        {"method": "isotonic", "a": 1.0, "b": 0.0, "raw_score": "decision_function"},
    ],
    ids=["unknown-raw-score-kind", "non-sigmoid-method"],
)
def test_predict_preference_rejects_unknown_kind_or_method(calibration: dict) -> None:
    with pytest.raises(ValueError):
        predict_preference(_DecisionModel(), calibration, X)
