"""Step `make export`: copy the best PreferenceScore model into the service (plan 10, T6, roadmap C1).

Best = `best` of `val_results.json` (highest val NDCG@10 among LR / RF / XGBoost binary / XGBoost
ranker; baselines, ALS and ablations are never exported). Writes exactly two files to
`<export-dir>/<version>/` (default `recommendation-service/models/preference/`):
`model.json` (XGBoost native, `get_booster().save_model`; serving loads `xgboost.Booster(model_file=...)`)
or `model.joblib` (sklearn estimator / pipeline, `compress=3`), and `model_card.json` (calibration
params, metrics, data summary, library versions). Version = `<run-name>-<algo>` with `--run-name`
= `v<N>-<data>-<YYYYMMDD>` (e.g. `v1-sim-20261110` -> `v1-sim-20261110-xgbrank`).

Metrics come from `val_results.json` (`make train`) and `reports/preference_results.json`
(`make evaluate`): the test set is not re-run. Refuses to overwrite an existing version; fails
(and removes the version folder) when the model file is >= 5 MB.
"""
from __future__ import annotations

import argparse
import platform
import re
import shutil
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version as package_version
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq

from app.ml import features
from recsys.common import DATASET_META_JSON, REPO_ROOT, RUN_META_JSON, fail, read_json, write_json
from recsys.evaluate import NAMES, RESULTS_STEM
from recsys.train import MODEL_FILE, VAL_RESULTS_JSON

PRIMARY_ALGOS = ("lr", "rf", "xgb", "xgbrank")
XGB_ALGOS = ("xgb", "xgbrank")
SOURCES = ("simulated", "real", "mixed")
MAX_MODEL_MB = 5.0
_LIBRARIES = {"sklearn": "scikit-learn", "numpy": "numpy", "scipy": "scipy", "joblib": "joblib", "xgboost": "xgboost"}
# Same rule as ml/face-shape export: run name `v<N>-<data>-<YYYYMMDD>`, max 60 chars.
_RUN_NAME = re.compile(r"v[0-9]+-[a-z0-9]+(-[a-z0-9]+)*-[0-9]{8}")
_RUN_NAME_MAX = 60


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset-dir", type=Path, default=Path("data/sim/dataset"))
    parser.add_argument("--models-dir", type=Path, default=Path("data/models"))
    parser.add_argument("--reports-dir", type=Path, default=Path("reports"))
    parser.add_argument("--run-name", required=True, help="v<N>-<data>-<YYYYMMDD>; version = <run-name>-<algo>")
    parser.add_argument("--source", choices=SOURCES, default="simulated", help="training data source for the card")
    parser.add_argument("--export-dir", type=Path, default=REPO_ROOT / "recommendation-service" / "models" / "preference")
    return parser


def _library_versions() -> dict[str, str | None]:
    versions: dict[str, str | None] = {"python": platform.python_version()}
    for key, dist in _LIBRARIES.items():
        try:
            versions[key] = package_version(dist)
        except PackageNotFoundError:
            versions[key] = None
    return versions


def main() -> None:
    args = build_parser().parse_args()
    if not _RUN_NAME.fullmatch(args.run_name) or len(args.run_name) > _RUN_NAME_MAX:
        fail(f"--run-name {args.run_name!r} must look like v<N>-<data>-<YYYYMMDD> (lowercase, max {_RUN_NAME_MAX} chars)")
    import joblib

    val_results = read_json(args.models_dir / VAL_RESULTS_JSON)
    if val_results is None:
        fail(f"{args.models_dir / VAL_RESULTS_JSON} not found - run `make train` first")
    test_results = read_json(args.reports_dir / f"{RESULTS_STEM}.json")
    if test_results is None:
        fail(f"{args.reports_dir / RESULTS_STEM}.json not found - run `make evaluate` first")
    algo = val_results["best"]
    entry = val_results["models"][algo]
    if algo not in PRIMARY_ALGOS or not entry["primary"]:
        fail(f"best model {algo!r} is not a primary model ({', '.join(PRIMARY_ALGOS)})")
    report_path = args.reports_dir / f"{RESULTS_STEM}.json"
    # The report must come from these models and this dataset (`make train` without `make evaluate` -> stale).
    if test_results.get("models") != val_results["models"] or test_results.get("best") != algo:
        fail(f"{report_path} is stale (other models than {args.models_dir / VAL_RESULTS_JSON}) - re-run `make evaluate`")
    if Path(test_results.get("dataset_dir", "")).resolve() != args.dataset_dir.resolve():
        fail(f"{report_path} is stale (dataset_dir {test_results.get('dataset_dir')!r} != {str(args.dataset_dir)!r}) - re-run `make evaluate`")
    if algo not in test_results["all_users"]:
        fail(f"{algo!r} has no test metrics in {report_path} - re-run `make evaluate`")
    source = args.models_dir / algo / MODEL_FILE
    if not source.is_file():
        fail(f"{source} not found - run `make train` first")

    # Guards before anything is written.
    meta = read_json(args.dataset_dir / DATASET_META_JSON)
    if meta is None:
        fail(f"{args.dataset_dir / DATASET_META_JSON} not found")
    if meta.get("feature_schema_version") != features.FEATURE_SCHEMA_VERSION:
        fail(f"dataset feature_schema_version={meta.get('feature_schema_version')!r} != {features.FEATURE_SCHEMA_VERSION!r}")
    names = features.feature_names()
    train_path = args.dataset_dir / "train.parquet"
    train_columns = pq.read_schema(train_path).names
    if [c for c in train_columns if c in set(names)] != names:
        fail(f"{train_path} feature columns do not match features.feature_names()")
    if any("face" in name.lower() for name in names):
        fail("a feature name contains 'face' - face-shape features must not reach the preference model")

    run_meta = read_json(args.dataset_dir.parent / RUN_META_JSON)
    users = len(pq.read_table(train_path, columns=["user_id"]).column("user_id").unique())

    model_version = f"{args.run_name}-{algo}"
    target = args.export_dir / model_version
    if target.exists():
        fail(f"{target} already exists - pick a new --run-name (versions are never overwritten)")
    model = joblib.load(source)
    n_inputs = model.get_booster().num_features() if algo in XGB_ALGOS else getattr(model, "n_features_in_", None)
    if n_inputs != len(names):
        fail(f"{source} takes {n_inputs} inputs, feature_names() has {len(names)} - re-run `make train`")

    calibration_results = test_results.get("calibration", {}).get(algo, {})
    card = {
        "version": model_version,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "algorithm": NAMES[algo],
        "objective": entry["objective"],
        "label_definition": entry["label_definition"],
        "feature_names": names,
        "feature_schema_version": features.FEATURE_SCHEMA_VERSION,
        "calibration": entry["calibration"],
        "best_params": entry["params"],
        "metrics": {
            # val = the sampled val-group NDCG@10 (selection only); test = full ranking, all users.
            "val": {"ndcg@10": entry["val_ndcg@10"]},
            "test": test_results["all_users"][algo],
            "brier": {split: calibration_results.get(split, {}).get("brier") for split in ("val", "test")},
        },
        "training_data_summary": {
            "source": args.source,
            "users": users,
            "items": meta["n_catalog_products"],
            "events": meta["n_events_used"],
            "catalog_source": meta["catalog_source"],
            "seeds": {"sim": run_meta.get("seed") if run_meta else None, "dataset": meta["seed"], "train": val_results["seed"]},
        },
        "library_versions": _library_versions(),
        "model_size_mb": None,
        "price_band_edges": meta["price_band_edges"],
        "uses_face_shape_features": False,
    }

    target.mkdir(parents=True)
    try:
        if algo in XGB_ALGOS:
            model_file = target / "model.json"
            model.get_booster().save_model(str(model_file))
        else:
            model_file = target / "model.joblib"
            joblib.dump(model, model_file, compress=3)
        size_mb = model_file.stat().st_size / 1024**2
        if size_mb < MAX_MODEL_MB:
            card["model_size_mb"] = round(size_mb, 3)
            write_json(card, target / "model_card.json")
    except BaseException:
        # Never leave a half-written version folder behind (it would block the re-run).
        shutil.rmtree(target, ignore_errors=True)
        raise
    if size_mb >= MAX_MODEL_MB:
        shutil.rmtree(target)
        fail(f"{model_file.name} is {size_mb:.2f} MB, limit {MAX_MODEL_MB:g} MB - shrink the grid (trees / depth)")
    print(f"Exported {NAMES[algo]} as {model_version} ({size_mb:.2f} MB) to {target}.")


if __name__ == "__main__":
    main()
