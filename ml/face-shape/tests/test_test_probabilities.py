"""`make test-probabilities` (plan 2026-09-29-12, AC14): frozen-model test probabilities CSV. Main flow only."""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import joblib
import numpy as np
import pandas as pd
import pytest

from app.ml.face_features import FEATURE_NAMES, FEATURE_SCHEMA_VERSION
from faceshape.common import DataPaths
from faceshape.evaluation import test_probabilities

CONFIG = Path(__file__).resolve().parents[1] / "config.yaml"
# config.yaml order is OVAL, ROUND, SQUARE, HEART, DIAMOND, OBLONG; the model uses sorted (sklearn) order.
CONFIG_CLASSES = ["OVAL", "ROUND", "SQUARE", "HEART", "DIAMOND", "OBLONG"]
MODEL_CLASSES = ["DIAMOND", "HEART", "OBLONG", "OVAL", "ROUND", "SQUARE"]
# Test row i has feature 0 == i; its probability row (MODEL_CLASSES column order). Argmax: OVAL, ROUND, HEART.
PROBA = np.array(
    [
        [0.05, 0.05, 0.05, 0.70, 0.10, 0.05],
        [0.10, 0.05, 0.05, 0.10, 0.60, 0.10],
        [0.30, 0.40, 0.10, 0.10, 0.05, 0.05],
    ]
)
TRUE = ["OVAL", "ROUND", "DIAMOND"]


class FakeModel:
    """Calibrated-model stand-in: `classes_` in sorted order, probabilities picked by feature 0 (row index)."""

    classes_ = np.array(MODEL_CLASSES)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return PROBA[X[:, 0].astype(int)]


def _confusion(pairs: list[tuple[str, str]]) -> list[list[int]]:
    """6x6 confusion in MODEL_CLASSES (sorted) label order from (true, pred) pairs."""
    cm = [[0] * 6 for _ in MODEL_CLASSES]
    for t, p in pairs:
        cm[MODEL_CLASSES.index(t)][MODEL_CLASSES.index(p)] += 1
    return cm


@pytest.fixture
def run(tmp_path: Path) -> SimpleNamespace:
    """3 test rows + 1 train row, a frozen fake svm model and a run report dir (metrics written by each test)."""
    paths = DataPaths(tmp_path / "data")
    paths.processed.mkdir(parents=True)
    ids = ["t0", "t1", "t2", "tr"]
    pd.DataFrame(
        {"image_id": ids, "person_id": ["p0", "p1", "p2", "p3"], "label": TRUE + ["SQUARE"],
         "split": ["test", "test", "test", "train"]}
    ).to_csv(paths.splits_csv, index=False)
    features = {name: [0.0] * 4 for name in FEATURE_NAMES}
    features[FEATURE_NAMES[0]] = [0.0, 1.0, 2.0, 9.0]
    pd.DataFrame(
        {"image_id": ids, "label": TRUE + ["SQUARE"], "feature_schema_version": [FEATURE_SCHEMA_VERSION] * 4, **features}
    ).to_parquet(paths.features_parquet, index=False)
    models = tmp_path / "models"
    models.mkdir()
    joblib.dump(FakeModel(), models / "svm_calibrated.joblib")
    reports = tmp_path / "reports"
    reports.mkdir()
    return SimpleNamespace(data=paths.root, models=models, reports=reports)


def _write_metrics(run: SimpleNamespace, confusion: list[list[int]]) -> None:
    metrics = {"accuracy": 2 / 3, "labels": MODEL_CLASSES, "confusion": confusion}
    (run.reports / "metrics_svm.json").write_text(json.dumps(metrics), encoding="utf-8")


def _main(monkeypatch: pytest.MonkeyPatch, run: SimpleNamespace) -> None:
    argv = [
        "test_probabilities", "--config", str(CONFIG), "--data-dir", str(run.data),
        "--out-dir", str(run.reports), "--models-dir", str(run.models), "--algo", "svm",
    ]
    monkeypatch.setattr(sys, "argv", argv)
    test_probabilities.main()


def test_writes_probabilities_in_config_class_order_by_name(run: SimpleNamespace, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC14: one row per test image, `true_label, p_<CLASS>` in config order, mapped by class name; only the CSV is written."""
    _write_metrics(run, _confusion([("OVAL", "OVAL"), ("ROUND", "ROUND"), ("DIAMOND", "HEART")]))
    before = (run.reports / "metrics_svm.json").read_text(encoding="utf-8")

    _main(monkeypatch, run)

    assert sorted(p.name for p in run.reports.iterdir()) == ["metrics_svm.json", "test_probabilities_svm.csv"]
    assert (run.reports / "metrics_svm.json").read_text(encoding="utf-8") == before
    out = pd.read_csv(run.reports / "test_probabilities_svm.csv")
    assert list(out.columns) == ["true_label"] + [f"p_{c}" for c in CONFIG_CLASSES]
    assert out["true_label"].tolist() == TRUE
    for c in CONFIG_CLASSES:
        np.testing.assert_allclose(out[f"p_{c}"].to_numpy(), PROBA[:, MODEL_CLASSES.index(c)])


def test_confusion_mismatch_fails_and_writes_nothing(run: SimpleNamespace, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC14: argmax confusion differs from the saved metrics_svm.json -> exit 1, no CSV."""
    _write_metrics(run, _confusion([("OVAL", "OVAL"), ("ROUND", "ROUND"), ("DIAMOND", "DIAMOND")]))

    with pytest.raises(SystemExit) as exc:
        _main(monkeypatch, run)

    assert exc.value.code == 1
    assert not (run.reports / "test_probabilities_svm.csv").exists()
