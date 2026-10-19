"""Run-name layout (plan 2026-10-19): export model id, required `--out-dir`, `evaluate --v1-dir`. Main flow only."""
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import joblib
import numpy as np
import pandas as pd
import pytest

from faceshape.common import DataPaths
from faceshape.evaluation import evaluate
from faceshape.training import export, tune

CONFIG = Path(__file__).resolve().parents[1] / "config.yaml"
CLASSES = ["DIAMOND", "HEART", "OBLONG", "OVAL", "ROUND", "SQUARE"]


@pytest.fixture
def run(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    """A dataset, a run model dir with a saved svm model + a run report dir with its metrics; tuning/calibration stubbed."""
    paths = DataPaths(tmp_path / "data" / "datasets" / "full-real")
    models = tmp_path / "data" / "runs" / "v6-full-real-20261101" / "models"
    models.mkdir(parents=True)
    paths.processed.mkdir(parents=True)
    pd.DataFrame(
        {"image_id": ["a", "b"], "person_id": ["p1", "p2"], "label": ["OVAL", "ROUND"], "split": ["train", "test"]}
    ).to_csv(paths.splits_csv, index=False)
    model = SimpleNamespace(classes_=np.array(CLASSES), estimator=SimpleNamespace(estimator=SimpleNamespace()))
    joblib.dump(model, models / "svm_calibrated.joblib")
    reports = tmp_path / "reports" / "runs" / "v6-full-real-20261101"
    reports.mkdir(parents=True)
    metrics = {"accuracy": 0.5, "macro_f1": 0.5, "test_brier": 0.1, "n_test": 1, "per_class": {}}
    (reports / "metrics_svm.json").write_text(json.dumps(metrics), encoding="utf-8")
    monkeypatch.setattr(export, "load_tuning", lambda out_dir: {"cv_folds": 5, "algos": {"svm": {"best_params": {}, "cv_macro_f1": 0.5}}})
    monkeypatch.setattr(export, "select_best", lambda config, out_dir: "svm")
    monkeypatch.setattr(export, "load_calibration", lambda out_dir: {"algos": {"svm": {}}})
    return SimpleNamespace(data=paths.root, models=models, reports=reports, export_dir=tmp_path / "export")


def _export(monkeypatch: pytest.MonkeyPatch, run: SimpleNamespace, *extra: str) -> None:
    argv = [
        "export", "--config", str(CONFIG), "--data-dir", str(run.data), "--models-dir", str(run.models),
        "--export-dir", str(run.export_dir), *extra,
    ]
    monkeypatch.setattr(sys, "argv", argv)
    export.main()


def test_export_names_the_model_after_the_run(run: SimpleNamespace, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC10: `--run-name v6-full-real-20261101` -> model id `v6-full-real-20261101-svm` (folder + card)."""
    _export(monkeypatch, run, "--out-dir", str(run.reports), "--run-name", "v6-full-real-20261101")

    card = json.loads((run.export_dir / "v6-full-real-20261101-svm" / "model_card.json").read_text(encoding="utf-8"))
    assert card["version"] == "v6-full-real-20261101-svm"
    assert (run.export_dir / "v6-full-real-20261101-svm" / "model.joblib").is_file()


def test_export_rejects_a_run_name_without_the_pattern(run: SimpleNamespace, monkeypatch: pytest.MonkeyPatch) -> None:
    """Error case: a run name that is not `v<N>-<data>-<YYYYMMDD>` fails and exports nothing."""
    with pytest.raises(SystemExit) as exc:
        _export(monkeypatch, run, "--out-dir", str(run.reports), "--run-name", "fs-20261101")
    assert exc.value.code == 1  # fail() on the pattern, not an argparse error (code 2)
    assert not run.export_dir.exists()


def test_tune_requires_out_dir(
    run: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """AC9: no `--out-dir` -> argparse error instead of writing into the `reports/` root."""
    monkeypatch.setattr(sys, "argv", ["tune", "--config", str(CONFIG), "--data-dir", str(run.data)])
    with pytest.raises(SystemExit) as exc:
        tune.main()
    assert exc.value.code == 2
    assert "--out-dir" in capsys.readouterr().err


def test_load_v1_reads_the_given_run_dir_only(tmp_path: Path) -> None:
    """AC13: `--v1-dir` points at the v1 run folder; without it there is no v1 section."""
    v1_dir = tmp_path / "runs" / "v1-full-real-20260930"
    v1_dir.mkdir(parents=True)
    (v1_dir / "metrics_svm.json").write_text(json.dumps({"macro_f1": 0.471}), encoding="utf-8")

    assert evaluate._load_v1(v1_dir, ["svm", "rf"]) == {"svm": {"macro_f1": 0.471}}
    assert evaluate._load_v1(None, ["svm"]) == {}


def test_evaluate_requires_models_dir(
    run: SimpleNamespace, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """AC7: a full evaluate without `--models-dir` -> argparse exit 2 (models live in data/runs/<run>/models)."""
    argv = ["evaluate", "--config", str(CONFIG), "--data-dir", str(run.data), "--out-dir", str(run.reports)]
    monkeypatch.setattr(sys, "argv", argv)
    with pytest.raises(SystemExit) as exc:
        evaluate.main()
    assert exc.value.code == 2
    assert "--models-dir" in capsys.readouterr().err
