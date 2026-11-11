"""Step `make test-probabilities`: save one calibrated model's test probability vectors (plan 2026-09-29-12, AC14).

A read-only second pass over the test split with the frozen model of a run: it loads
`<models-dir>/<algo>_calibrated.joblib`, predicts the test rows and writes only
`<out-dir>/test_probabilities_<algo>.csv` (one row per test image, columns `true_label, p_<CLASS>...` in
`config.yaml` `classes` order; no image or person id). No metric changes: before writing, the argmax
confusion matrix must equal the saved `<out-dir>/metrics_<algo>.json["confusion"]` (labels mapped by name),
so `make evaluate` must have run first. `metrics_*.json`, the other reports and `summary.md` are not touched.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from faceshape.common import build_parser, fail, parse, require_file
from faceshape.evaluation.evaluate import compute_metrics
from faceshape.training.shared import TRAINED_ALGOS, class_names, label_order, load_dataset, model_path, xy


def _saved_confusion(path: Path, classes: list[str]) -> np.ndarray:
    """Saved test confusion matrix of `make evaluate`, re-ordered to `classes` by label name."""
    require_file(path, "Run `make evaluate` first.")
    saved = json.loads(path.read_text(encoding="utf-8"))
    labels: list[str] = saved["labels"]
    if sorted(labels) != sorted(classes):
        fail(f"{path} has labels {labels}, expected the config classes {classes}.")
    cm = np.asarray(saved["confusion"])
    idx = [labels.index(c) for c in classes]
    return cm[np.ix_(idx, idx)]


def main() -> None:
    parser = build_parser("Save the test probability vectors of one calibrated model (no metric changes).")
    parser.add_argument("--out-dir", type=Path, required=True, help="report folder (reports/runs/<run>)")
    parser.add_argument("--models-dir", type=Path, required=True, help="model folder (data/runs/<run>/models)")
    parser.add_argument("--algo", choices=TRAINED_ALGOS, default="svm", help="calibrated model to use (default: svm)")
    args, config, paths = parse(parser)
    import joblib

    classes: list[str] = config["classes"]
    path = model_path(args.models_dir, args.algo)
    require_file(path, "Run `make train` first.")
    expected = _saved_confusion(args.out_dir / f"metrics_{args.algo}.json", classes)

    test_df = load_dataset(paths, ("test",))
    X_test, y_test = xy(test_df)
    model = joblib.load(path)
    names = class_names(model, label_order(config))
    proba = model.predict_proba(X_test)
    y_pred = np.asarray(names)[proba.argmax(axis=1)]

    confusion = np.asarray(compute_metrics(y_test, y_pred, classes)["confusion"])
    if not np.array_equal(confusion, expected):
        fail(f"Argmax confusion of {path} does not match the saved metrics_{args.algo}.json - wrong model or data?")

    columns = {name: i for i, name in enumerate(names)}
    out = pd.DataFrame({"true_label": y_test})
    for c in classes:
        out[f"p_{c}"] = proba[:, columns[c]]
    csv = args.out_dir / f"test_probabilities_{args.algo}.csv"
    out.to_csv(csv, index=False)
    print(f"Wrote {csv} ({len(out)} test rows); argmax confusion matches metrics_{args.algo}.json.")


if __name__ == "__main__":
    main()
