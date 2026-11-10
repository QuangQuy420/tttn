"""Plan 2026-09-29-10 (PreferenceScore training): train -> evaluate -> export on the tiny `smoke_run`.

Everything goes under pytest's tmp dir (never `data/`, `reports/` or `recommendation-service/models/`).
The default grid runs as is (~45 s on the 100 users / 30 days dataset): the CLIs have no grid flag.
AC11 (same seed twice -> same numbers) is not covered: it would double that time.
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from app.ml import features, preference

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT.parents[1] / "recommendation-service"
RUN_NAME = "v1-sim-20261110"
BASELINES = {"popularity", "content"}
ML_MODELS = {"lr", "rf", "xgb"}
METRICS = [f"{kind}@{k}" for k in (5, 10) for kind in ("precision", "recall", "hitrate", "ndcg")]


def _run(module: str, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    env = {**os.environ, "PYTHONPATH": f"{SERVICE}{os.pathsep}{ROOT / 'src'}"}
    result = subprocess.run(
        [sys.executable, "-m", module, *args], cwd=ROOT, env=env, capture_output=True, text=True, timeout=600
    )
    if check:
        assert result.returncode == 0, f"{module} failed:\n{result.stdout}\n{result.stderr}"
    return result


@pytest.fixture(scope="module")
def trained(smoke_run, tmp_path_factory: pytest.TempPathFactory) -> SimpleNamespace:
    base = tmp_path_factory.mktemp("preference")
    models, reports, export = base / "models", base / "reports", base / "export"
    dataset = ["--dataset-dir", str(smoke_run.dataset)]
    _run("recsys.train", *dataset, "--models-dir", str(models), "--seed", "42")
    _run("recsys.evaluate", *dataset, "--models-dir", str(models), "--reports-dir", str(reports), "--seed", "42")
    _run(
        "recsys.export", *dataset, "--models-dir", str(models), "--reports-dir", str(reports),
        "--run-name", RUN_NAME, "--export-dir", str(export),
    )
    return SimpleNamespace(
        dataset=smoke_run.dataset,
        models=models,
        reports=reports,
        export=export,
        results=json.loads((reports / "preference_results.json").read_text()),
        val_results=json.loads((models / "val_results.json").read_text()),
    )


def test_results_compare_baselines_and_ml_models_with_ci_ac1_ac2_ac5_ac6(trained):
    """AC1 + AC2 + AC5 + AC6: all-users table, P/R/HR/NDCG @5/@10, each with a bootstrap CI."""
    table = trained.results["all_users"]
    assert BASELINES | ML_MODELS <= set(table)
    for name in BASELINES | ML_MODELS:
        for metric in METRICS:
            cell = table[name][metric]
            assert cell["ci_low"] <= cell["mean"] <= cell["ci_high"], (name, metric)
    # AC4 / AC5: every test user counts (one held-out product each).
    test_users = pd.read_parquet(trained.dataset / "test.parquet", columns=["user_id"])["user_id"].nunique()
    assert table["lr"]["n_users"]["mean"] == test_users


def test_best_model_and_calibration_come_from_val_ac3_ac7(trained):
    """AC3 + AC7: best = highest val NDCG@10 among the primary models; sigmoid fitted on val."""
    models = trained.val_results["models"]
    primary = {name: entry for name, entry in models.items() if entry["primary"]}
    assert ML_MODELS <= set(primary)
    assert trained.val_results["best"] == max(primary, key=lambda name: primary[name]["val_ndcg@10"])
    for entry in primary.values():
        assert entry["calibration"]["method"] == "sigmoid"
        assert entry["calibration"]["fitted_on"] == "val"
    assert (trained.reports / "figures" / "reliability.png").is_file()


def test_report_has_feature_importance_and_side_tables_ac8_ac12(trained):
    """AC8 + AC12: importance rows for the best model, try-on+ table and label ablation (>=1, >=3)."""
    assert trained.results["feature_importance"]["model"] == trained.val_results["best"]
    assert trained.results["feature_importance"]["rows"]
    assert BASELINES | ML_MODELS <= set(trained.results["tryon_plus"])
    family = trained.results["ablation_family"]
    # write_json sorts keys, so only the set is stable.
    assert set(trained.results["ablation"]) == {f"{family}_ge1", family, f"{family}_ge3"}


def test_export_writes_two_files_with_a_face_free_card_that_scores_ac9_ac10(trained):
    """AC9 + AC10: exactly model file + model_card.json, < 5 MB, reloaded export scores in (0, 1)."""
    best = trained.val_results["best"]
    target = trained.export / f"{RUN_NAME}-{best}"
    files = sorted(path.name for path in target.iterdir())
    model_file = "model.json" if best in ("xgb", "xgbrank") else "model.joblib"
    assert files == sorted([model_file, "model_card.json"])
    assert (target / model_file).stat().st_size < 5 * 1024**2

    card = json.loads((target / "model_card.json").read_text())
    assert card["version"] == f"{RUN_NAME}-{best}"
    assert card["uses_face_shape_features"] is False
    assert card["feature_schema_version"] == features.FEATURE_SCHEMA_VERSION
    assert card["feature_names"] == features.feature_names()
    assert card["calibration"]["method"] == "sigmoid"
    assert card["metrics"]["test"] == trained.results["all_users"][best]

    if model_file == "model.json":
        import xgboost

        model = xgboost.Booster(model_file=str(target / model_file))
    else:
        import joblib

        model = joblib.load(target / model_file)
    rows = pd.read_parquet(trained.dataset / "test.parquet").head(50)
    X = np.ascontiguousarray(rows[card["feature_names"]].to_numpy(dtype=np.float32))
    scores = preference.predict_preference(model, card["calibration"], X)
    assert scores.shape == (len(rows),)
    assert np.all((scores > 0) & (scores < 1))


def test_export_refuses_a_bad_run_name(trained, tmp_path):
    """Error case: run name must look like v<N>-<data>-<YYYYMMDD>; nothing is written."""
    result = _run(
        "recsys.export", "--dataset-dir", str(trained.dataset), "--models-dir", str(trained.models),
        "--reports-dir", str(trained.reports), "--run-name", "Latest", "--export-dir", str(tmp_path / "out"),
        check=False,
    )
    assert result.returncode != 0
    assert not (tmp_path / "out").exists()
