"""`faceshape.evaluation.compare` (plan 2026-10-18), main flow only."""
import json
import sys
from pathlib import Path

import pandas as pd
import pytest

from faceshape.common import DataPaths
from faceshape.evaluation import compare

CLASSES = ["OVAL", "ROUND", "SQUARE", "HEART", "DIAMOND", "OBLONG"]


def _metrics(macro_f1: float) -> dict:
    confusion = [[3 if i == j else 0 for j in range(len(CLASSES))] for i in range(len(CLASSES))]
    return {
        "algo": "svm",
        "n_test": 18,
        "accuracy": 0.5,
        "macro_f1": macro_f1,
        "per_class": {c: {"precision": 0.5, "recall": 0.5, "f1": 0.5, "support": 3} for c in CLASSES},
        "labels": CLASSES,
        "confusion": confusion,
        "test_brier": 0.1234,
    }


def _write_run(tmp_path: Path, name: str, macro_f1: float, synthetic: int) -> tuple[Path, Path]:
    data, reports = tmp_path / "data" / name, tmp_path / "reports" / name
    paths = DataPaths(data)
    paths.processed.mkdir(parents=True)
    reports.mkdir(parents=True)
    ids = ["train_1", "val_1", "test_1"] + [f"syn_{i}" for i in range(synthetic)]
    split = ["train", "val", "test"] + ["train"] * synthetic
    source = ["niten19"] * 3 + ["synthetic/gemini"] * synthetic
    pd.DataFrame({"image_id": ids, "person_id": ids, "label": "DIAMOND", "split": split}).to_csv(paths.splits_csv, index=False)
    pd.DataFrame({"image_id": ids, "source": source}).to_parquet(paths.features_parquet, index=False)
    (reports / "metrics_svm.json").write_text(json.dumps(_metrics(macro_f1)), encoding="utf-8")
    return data, reports


def test_compare_writes_report_with_all_runs_and_chart(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC9, AC10, AC13: compare.md lists the macro-F1 of all 4 runs + origin counts, and compare_f1.png exists."""
    runs = (
        ("v2-full-real-20261005", *_write_run(tmp_path, "current", 0.611, 0)),
        ("v3-curated-real-20261018", *_write_run(tmp_path, "real", 0.622, 0)),
        ("v4-curated-real-synth-20261018", *_write_run(tmp_path, "real-synth", 0.633, 2)),
        ("v5-full-real-synth-20261019", *_write_run(tmp_path, "all-synth", 0.644, 2)),
    )
    monkeypatch.setattr(compare, "RUNS", runs)
    monkeypatch.setattr(compare, "select_best", lambda config, out_dir: "svm")
    config = tmp_path / "config.yaml"
    config.write_text(f"classes: {CLASSES}\n", encoding="utf-8")
    out_dir = tmp_path / "out"
    monkeypatch.setattr(sys, "argv", ["compare", "--config", str(config), "--out-dir", str(out_dir)])

    compare.main()

    report = (out_dir / "compare.md").read_text(encoding="utf-8")
    for name, macro in (
        ("v2-full-real-20261005", "0.611"),
        ("v3-curated-real-20261018", "0.622"),
        ("v4-curated-real-synth-20261018", "0.633"),
        ("v5-full-real-synth-20261019", "0.644"),
    ):
        assert f"| {name} | SVM (RBF) | {macro} |" in report
    assert "repeated test pass" in report
    # v4: 1 real + 2 synthetic train images; DIAMOND row = train real, train synthetic, val real, ...
    assert "| DIAMOND | 1 | 2 | 1 | 0 | 1 | 0 | 5 |" in report
    assert (out_dir / "compare_f1.png").stat().st_size > 0
