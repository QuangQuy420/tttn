"""Step `make export`: copy the calibrated best model into the service (AC11, AC12).

Writes `<export-dir>/<version>/model.joblib` (the `CalibratedClassifierCV` of the best algorithm by
CV macro-F1 - only sklearn/xgboost objects) and `model_card.json`. Version = `fs-YYYYMMDD-<algo>`.
Metrics come from `metrics_<algo>.json` written by `make evaluate` (the test set is not re-run).
Fails when `model.joblib` is larger than `training.max_model_mb`. `--export-dir` overrides
`training.export_dir` (the sample run writes to `data/sample/export`).
"""
from __future__ import annotations

import json
import platform
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version as package_version
from pathlib import Path
from typing import Any

import pandas as pd

from app.ml.face_features import FEATURE_NAMES, FEATURE_SCHEMA_VERSION
from faceshape.common import DataPaths, build_parser, fail, parse, require_file
from faceshape.training.shared import ALGO_NAMES, best_algo, class_names, label_order, load_tuning, model_path

_LIBRARIES = {"sklearn": "scikit-learn", "numpy": "numpy", "scipy": "scipy", "joblib": "joblib", "xgboost": "xgboost", "mediapipe": "mediapipe"}


def _library_versions() -> dict[str, str | None]:
    versions: dict[str, str | None] = {"python": platform.python_version()}
    for key, dist in _LIBRARIES.items():
        try:
            versions[key] = package_version(dist)
        except PackageNotFoundError:
            versions[key] = None
    return versions


def _data_summary(paths: DataPaths) -> dict[str, Any]:
    require_file(paths.splits_csv, "Run `make split` first.")
    splits = pd.read_csv(paths.splits_csv, dtype=str)
    counts = pd.crosstab(splits["label"], splits["split"])
    return {
        "counts": {split: {label: int(n) for label, n in counts[split].items()} for split in counts.columns},
        "n_images": len(splits),
        "n_persons": int(splits["person_id"].nunique()),
        "persons_per_split": {s: int(n) for s, n in splits.groupby("split")["person_id"].nunique().items()},
    }


def main() -> None:
    parser = build_parser("Export the calibrated best model + model_card.json.")
    parser.add_argument("--out-dir", type=Path, default=Path("reports"), help="report folder (default: reports)")
    parser.add_argument("--export-dir", type=Path, default=None, help="override training.export_dir")
    args, config, paths = parse(parser)
    import joblib

    cfg = config["training"]
    export_dir = args.export_dir or Path(cfg["export_dir"])
    tuning = load_tuning(args.out_dir)
    algo = best_algo(tuning)
    metrics_path = args.out_dir / f"metrics_{algo}.json"
    require_file(metrics_path, "Run `make evaluate` first.")
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    source = model_path(paths, algo)
    require_file(source, "Run `make train` first.")
    model = joblib.load(source)

    now = datetime.now(timezone.utc)
    model_version = f"fs-{now:%Y%m%d}-{algo}"
    target = export_dir / model_version
    target.mkdir(parents=True, exist_ok=True)
    model_file = target / "model.joblib"
    joblib.dump(model, model_file, compress=3)
    size_mb = model_file.stat().st_size / 1024**2
    max_mb = float(cfg["max_model_mb"])
    if size_mb > max_mb:
        model_file.unlink()
        fail(f"{model_file} is {size_mb:.2f} MB, above training.max_model_mb={max_mb:g} - limit the model size.")

    card = {
        "version": model_version,
        "created_at": now.isoformat(timespec="seconds"),
        "algorithm": ALGO_NAMES[algo],
        "estimator": f"CalibratedClassifierCV(FrozenEstimator({type(model.estimator.estimator).__name__}), method={cfg['calibration']})",
        "best_params": tuning["algos"][algo]["best_params"],
        "classes": class_names(model, label_order(config)),
        "feature_names": list(FEATURE_NAMES),
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "metrics": {
            "cv_macro_f1": tuning["algos"][algo]["cv_macro_f1"],
            "cv_folds": tuning["cv_folds"],
            "test_accuracy": metrics["accuracy"],
            "test_macro_f1": metrics["macro_f1"],
            "test_brier": metrics.get("test_brier"),
            "n_test": metrics["n_test"],
            "per_class": metrics["per_class"],
        },
        "training_data_summary": _data_summary(paths),
        "library_versions": _library_versions(),
        "model_size_mb": round(size_mb, 3),
    }
    (target / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")
    print(f"Exported {ALGO_NAMES[algo]} as {model_version} ({size_mb:.2f} MB) to {target}.")


if __name__ == "__main__":
    main()
