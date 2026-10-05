"""Step `make evaluate`: the single test-set pass for every final method (AC5, AC6, AC7).

Methods: Rule v0 (production), Rule v1 (literature / fitted on train), and the calibrated models
from `make train`. Each method predicts the test rows exactly once. All metrics use
`labels = config classes` and `zero_division=0`. Writes per method `<out-dir>/metrics_<algo>.json`,
`classification_report_<algo>.txt` and `confusion_<algo>.png` (counts + row-normalized), plus the
cross-method table `<out-dir>/summary.md`. The best model is chosen by CV macro-F1 (Q1,
`training.selection`), never by these test numbers. When the archived v1 metrics exist in
`<out-dir>/v1-fs-20260930/`, the summary adds a v1 -> v2 comparison (plan 2026-10-05).

`--summary-only` rebuilds `summary.md` from the saved `metrics_<algo>.json` + `tuning.json` +
`calibration.json` without loading any model or predicting on test again.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from faceshape.evaluation.baselines import PROTOTYPE_FEATURES, CurrentRuleBaseline, PrototypeRuleBaseline
from faceshape.training.calibrate import multiclass_brier
from faceshape.common import DataPaths, build_parser, fail, parse, require_file
from faceshape.training.shared import (
    ALGO_NAMES,
    class_names,
    label_order,
    load_calibration,
    load_dataset,
    load_tuning,
    model_path,
    select_best,
    xy,
)

# Archived reports of the first test pass (fs-20260930-svm, unweighted calibration).
V1_DIR = "v1-fs-20260930"


def _test_landmarks(paths: DataPaths, image_ids: list[str]) -> np.ndarray:
    require_file(paths.landmarks_npz, "Run `make landmarks` first.")
    data = np.load(paths.landmarks_npz)
    index = {str(image_id): i for i, image_id in enumerate(data["image_id"])}
    missing = [i for i in image_ids if i not in index]
    if missing:
        fail(f"{len(missing)} test images have no landmarks in {paths.landmarks_npz}: {missing[:5]}")
    return data["landmarks"][[index[i] for i in image_ids]]


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, classes: list[str]) -> dict[str, Any]:
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support

    precision, recall, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=classes, zero_division=0
    )
    macro = precision_recall_fscore_support(y_true, y_pred, labels=classes, average="macro", zero_division=0)
    return {
        "n_test": len(y_true),
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_precision": float(macro[0]),
        "macro_recall": float(macro[1]),
        "macro_f1": float(macro[2]),
        "weighted_f1": float(f1_score(y_true, y_pred, labels=classes, average="weighted", zero_division=0)),
        "per_class": {
            c: {"precision": float(p), "recall": float(r), "f1": float(f), "support": int(s)}
            for c, p, r, f, s in zip(classes, precision, recall, f1, support)
        },
        "labels": classes,
        "confusion": confusion_matrix(y_true, y_pred, labels=classes).tolist(),
    }


def _plot_confusion(cm: np.ndarray, classes: list[str], title: str, out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    rows = cm.sum(axis=1, keepdims=True)
    norm = np.divide(cm, rows, out=np.zeros_like(cm, dtype=float), where=rows > 0)
    fig, axes = plt.subplots(1, 2, figsize=(11, 4.8), facecolor="#fcfcfb")
    for ax, values, sub, fmt in ((axes[0], cm, "counts", "{:d}"), (axes[1], norm, "row-normalized (recall)", "{:.2f}")):
        vmax = values.max() if values.max() > 0 else 1
        ax.imshow(values, cmap="Blues", vmin=0, vmax=vmax)
        for i in range(len(classes)):
            for j in range(len(classes)):
                v = values[i, j]
                ax.text(j, i, fmt.format(v), ha="center", va="center", fontsize=9, color="white" if v > vmax * 0.6 else "#1f1f1e")
        ax.set_xticks(range(len(classes)), classes, rotation=35, ha="right")
        ax.set_yticks(range(len(classes)), classes)
        ax.set_xlabel("predicted")
        ax.set_ylabel("true")
        ax.set_title(sub, loc="left")
    fig.suptitle(f"{title} - test confusion matrix", x=0.01, ha="left")
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def _md_table(header: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join(lines)


def _fmt(value: float | None, digits: int = 3) -> str:
    return "-" if value is None or not np.isfinite(value) else f"{value:.{digits}f}"


def _prototype_table(rule: PrototypeRuleBaseline) -> str:
    rows = [[c, *(_fmt(v) for v in row)] for c, row in rule.prototype_table().iterrows()]
    return _md_table(["class", *PROTOTYPE_FEATURES], rows)


def _predicted_counts(m: dict[str, Any], classes: list[str]) -> dict[str, int]:
    """Test predictions per class = column sums of the saved confusion matrix."""
    cm = np.asarray(m["confusion"])
    counts = dict(zip(m["labels"], cm.sum(axis=0).tolist()))
    return {c: int(counts.get(c, 0)) for c in classes}


def _load_v1(out_dir: Path, algos: list[str]) -> dict[str, dict[str, Any]]:
    """Archived v1 metrics of the trained algorithms (empty when `<out-dir>/v1-fs-20260930/` is absent)."""
    paths = {algo: out_dir / V1_DIR / f"metrics_{algo}.json" for algo in algos}
    return {algo: json.loads(path.read_text(encoding="utf-8")) for algo, path in paths.items() if path.is_file()}


def _v1_section(v1: dict[str, dict[str, Any]], results: dict[str, dict[str, Any]], classes: list[str]) -> list[str]:
    """v1 -> v2 table per trained algorithm (both test passes) + the second-pass note."""
    rows = []
    for algo, old in v1.items():
        new = results[algo]
        rows.append([
            ALGO_NAMES[algo], _fmt(old["macro_f1"]), _fmt(new["macro_f1"]),
            _fmt(old["per_class"]["DIAMOND"]["f1"]), _fmt(new["per_class"]["DIAMOND"]["f1"]),
            str(_predicted_counts(old, classes)["DIAMOND"]), str(_predicted_counts(new, classes)["DIAMOND"]),
            _fmt(old.get("test_brier"), 4), _fmt(new.get("test_brier"), 4),
        ])
    return [
        "## v1 -> v2",
        "",
        f"v1 = the archived first test pass in `{V1_DIR}/` (unweighted sigmoid calibration, selection by "
        "uncalibrated tuning CV, exported as fs-20260930-svm); v2 = this run.",
        "",
        _md_table(
            ["method", "v1 macro F1", "v2 macro F1", "v1 DIAMOND F1", "v2 DIAMOND F1", "v1 DIAMOND predicted",
             "v2 DIAMOND predicted", "v1 test Brier", "v2 test Brier"],
            rows,
        ),
        "",
        "- This is the second test pass. v1 (fs-20260930-svm) was evaluated once on 2026-09-30; v2 changes only "
        "the calibration weights and the selection rule - a decision-rule defect, not tuning on test. Grids, "
        "features and splits are unchanged.",
        "",
    ]


def _summary(results: dict[str, dict[str, Any]], tuning: dict[str, Any], calibration: dict[str, Any], selection: str,
             best: str, classes: list[str], n_persons: int, fitted: PrototypeRuleBaseline, root: Path,
             v1: dict[str, dict[str, Any]], regenerated: bool = False) -> str:
    calibrated_cv = {algo: res.get("cv_macro_f1_calibrated") for algo, res in calibration["algos"].items()}
    weight = calibration.get("sample_weight")
    rows = []
    for algo, m in results.items():
        name = ALGO_NAMES[algo] + (" **(best)**" if algo == best else "")
        rows.append([
            name, _fmt(m["accuracy"]), _fmt(m["macro_precision"]), _fmt(m["macro_recall"]), _fmt(m["macro_f1"]),
            _fmt(m["weighted_f1"]), _fmt(m.get("cv_macro_f1")), _fmt(calibrated_cv.get(algo)), _fmt(m.get("test_brier")),
        ])
    per_class = [[ALGO_NAMES[a], *(_fmt(m["per_class"][c]["f1"]) for c in classes)] for a, m in results.items()]
    first = next(iter(results.values()))
    support = dict(zip(first["labels"], np.asarray(first["confusion"]).sum(axis=1).tolist()))
    support = {c: int(support.get(c, 0)) for c in classes}
    n_test = int(first["n_test"])
    predicted = {a: _predicted_counts(m, classes) for a, m in results.items()}
    counts_rows = [[ALGO_NAMES[a], *(str(predicted[a][c]) for c in classes)] for a in results]
    no_diamond = [ALGO_NAMES[a] for a in results if a in tuning["algos"] and predicted[a].get("DIAMOND", 0) == 0]
    diamond_notes = []
    if no_diamond:
        diamond_notes.append(
            f"- **{', '.join(no_diamond)} (calibrated) never predicts DIAMOND on test**: the argmax of its "
            "calibrated probabilities never ranks DIAMOND first."
        )
    if weight == "balanced":
        diamond_notes.append(
            "- Calibration is fitted on val with balanced sample weights (weight per class = n / (k * n_c)), so "
            "the sigmoid keeps the class balancing of the models instead of re-learning val's real class "
            "frequencies (unweighted, as in v1, it cancelled `class_weight` and the calibrated SVM never predicted "
            "DIAMOND). The calibrated probabilities are therefore \"balanced-prior\": comparable across classes, "
            "not real-world class frequencies."
        )
    else:
        diamond_notes.append(
            "- Calibration is fitted on val without sample weights (`training.calibration_weight: null`, v1 "
            "behaviour): the sigmoid re-learns val's real class frequencies, which cancels the `class_weight` "
            "balancing of the models."
        )
    if "rule_v1_literature" in predicted:
        lit = predicted["rule_v1_literature"]
        top = max(lit, key=lit.get)
        literature_fc = PrototypeRuleBaseline.literature().prototype_table()["forehead_cheek"].median()
        fitted_fc = fitted.prototype_table()["forehead_cheek"].median()
        diamond_notes.append(
            f"- Rule v1 (literature) predicts {top} for {lit[top]} of {n_test} test images, because the literature "
            f"prototype scales (e.g. forehead_cheek ~{literature_fc:.2f}) do not match our features (~{fitted_fc:.2f})."
        )
    generated_by = "`make evaluate`" + (" (summary regenerated from the saved `metrics_*.json`, no new test pass)" if regenerated else "")
    not_done = [f"- {res['name']}: {res['status']}." for res in tuning["algos"].values() if res.get("status") != "trained"]
    if selection == "calibrated_cv":
        best_line = (
            f"- Best model = highest CV macro-F1 of the calibrated pipeline (fit + calibrate) on train+val "
            f"({calibration['cv_folds']}-fold StratifiedGroupKFold by person, seed {calibration['seed']}): "
            f"**{ALGO_NAMES[best]}** - the same model that is exported. Test numbers were not used to choose it."
        )
    else:
        best_line = (
            f"- Best model = highest (uncalibrated) tuning CV macro-F1 on train+val ({tuning['cv_folds']}-fold "
            f"StratifiedGroupKFold by person, seed {tuning['seed']}): **{ALGO_NAMES[best]}**. Test numbers were "
            "not used to choose it."
        )

    lines = [
        "# Face-shape classifiers - test results (E1)",
        "",
        f"Generated {date.today().isoformat()} from `{root}` by {generated_by}. Numbers come from the "
        "pipeline outputs; do not edit by hand.",
        "",
        f"Test set: {n_test} images, {n_persons} persons, identity-disjoint from "
        "train/val (`processed/splits.csv`). Each method predicted the test set exactly once.",
        "",
        "## Overall",
        "",
        _md_table(
            ["method", "accuracy", "macro precision", "macro recall", "macro F1", "weighted F1", "CV macro F1",
             "CV macro F1 (calibrated)", "test Brier"],
            rows,
        ),
        "",
        best_line,
        f"- Trained models are the calibrated versions (fit on train, {calibration['method']} calibration on val, "
        f"sample_weight={weight}); test Brier = mean one-vs-rest Brier score on test. CV macro F1 = uncalibrated "
        "tuning score; CV macro F1 (calibrated) = person-grouped CV of the whole fit + calibrate pipeline "
        "(`calibration.json`). Rule methods have no CV score or probabilities.",
        "- Rule v0 runs the production code on normalized MediaPipe coordinates (its aspect-ratio issue "
        "included); Rule v1 and the trained models use the corrected pixel-space features.",
        *not_done,
        "",
        "## F1 per class",
        "",
        _md_table(["method", *(f"{c} (n={support[c]})" for c in classes)], per_class),
        "",
        f"- **DIAMOND has only {support.get('DIAMOND', 0)} test images** (and few persons); its per-class "
        "numbers have a wide margin of error and should not be over-read.",
        "- Landmark-feature models in the literature reach roughly 50-70% accuracy; numbers reported on the "
        "original niten19 split are inflated by duplicate and identity leakage, so this identity-aware test "
        "set is expected to score lower.",
        "",
        "## Predicted class counts (test)",
        "",
        "Column sums of each method's test confusion matrix (`metrics_<method>.json`).",
        "",
        _md_table(["method", *(f"{c} (true n={support[c]})" for c in classes)], counts_rows),
        "",
        *diamond_notes,
        "",
        *(_v1_section(v1, results, classes) if v1 else []),
        "## Rule v1 prototypes",
        "",
        "Literature prototypes (face-metrics, MIT) - defined on other landmarks, so their scale can differ from "
        "these features (compare with the fitted medians below):",
        "",
        _prototype_table(PrototypeRuleBaseline.literature()),
        "",
        "Fitted prototypes - per-class medians of the train split:",
        "",
        _prototype_table(fitted),
        "",
        "Per-method details: `metrics_<method>.json`, `classification_report_<method>.txt`, `confusion_<method>.png`.",
        "",
    ]
    return "\n".join(lines)


def _write_saved_summary(out_dir: Path, paths: DataPaths, tuning: dict[str, Any], calibration: dict[str, Any],
                        selection: str, best: str, classes: list[str], fitted: PrototypeRuleBaseline) -> None:
    """`--summary-only`: summary.md from the saved metrics files; test labels/features are not read."""
    algos = ["rule_v0", "rule_v1_literature", "rule_v1_fitted"]
    trained = [a for a, res in tuning["algos"].items() if res.get("status") == "trained"]
    algos += trained
    results = {}
    for algo in algos:
        path = out_dir / f"metrics_{algo}.json"
        require_file(path, "Run `make evaluate` first.")
        results[algo] = json.loads(path.read_text(encoding="utf-8"))
    require_file(paths.splits_csv, "Run `make split` first.")
    splits = pd.read_csv(paths.splits_csv, dtype=str)
    n_persons = int(splits.loc[splits["split"] == "test", "person_id"].nunique())
    summary = out_dir / "summary.md"
    v1 = _load_v1(out_dir, trained)
    summary.write_text(
        _summary(results, tuning, calibration, selection, best, classes, n_persons, fitted, paths.root, v1, regenerated=True),
        encoding="utf-8",
    )
    print(f"Rebuilt {summary} from the saved metrics (no test prediction).")


def main() -> None:
    parser = build_parser("Evaluate every final method once on the test split.")
    parser.add_argument("--out-dir", type=Path, default=Path("reports"), help="report folder (default: reports)")
    parser.add_argument(
        "--summary-only", action="store_true",
        help="rebuild summary.md from the saved metrics_<algo>.json (no model loading, no test prediction)",
    )
    args, config, paths = parse(parser)
    import joblib
    from sklearn.metrics import classification_report

    classes: list[str] = config["classes"]
    order = label_order(config)
    tuning = load_tuning(args.out_dir)
    calibration = load_calibration(args.out_dir)
    selection = str(config["training"].get("selection", "tuning_cv"))
    best = select_best(config, args.out_dir)

    train_df = load_dataset(paths, ("train",))
    if args.summary_only:
        _write_saved_summary(args.out_dir, paths, tuning, calibration, selection, best, classes, PrototypeRuleBaseline.fitted(train_df))
        return
    test_df = load_dataset(paths, ("test",))
    X_test, y_test = xy(test_df)
    fitted = PrototypeRuleBaseline.fitted(train_df)

    predictions: dict[str, tuple[np.ndarray, float | None]] = {
        "rule_v0": (CurrentRuleBaseline().predict(_test_landmarks(paths, test_df["image_id"].tolist())), None),
        "rule_v1_literature": (PrototypeRuleBaseline.literature().predict(test_df), None),
        "rule_v1_fitted": (fitted.predict(test_df), None),
    }
    for algo, res in tuning["algos"].items():
        if res.get("status") != "trained":
            continue
        path = model_path(paths, algo)
        require_file(path, "Run `make train` first.")
        model = joblib.load(path)
        names = class_names(model, order)
        proba = model.predict_proba(X_test)
        predictions[algo] = (np.asarray(names)[proba.argmax(axis=1)], multiclass_brier(y_test, proba, names))

    results: dict[str, dict[str, Any]] = {}
    for algo, (y_pred, brier) in predictions.items():
        metrics = {"algo": algo, "name": ALGO_NAMES[algo], **compute_metrics(y_test, y_pred, classes)}
        if algo in tuning["algos"]:
            metrics["cv_macro_f1"] = tuning["algos"][algo]["cv_macro_f1"]
            metrics["test_brier"] = brier
        results[algo] = metrics
        (args.out_dir / f"metrics_{algo}.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        report = classification_report(y_test, y_pred, labels=classes, zero_division=0, digits=3)
        (args.out_dir / f"classification_report_{algo}.txt").write_text(f"{ALGO_NAMES[algo]} (test)\n\n{report}", encoding="utf-8")
        _plot_confusion(np.asarray(metrics["confusion"]), classes, ALGO_NAMES[algo], args.out_dir / f"confusion_{algo}.png")
        print(f"{ALGO_NAMES[algo]}: accuracy {metrics['accuracy']:.4f}, macro-F1 {metrics['macro_f1']:.4f}.")

    summary = args.out_dir / "summary.md"
    n_persons = int(test_df["person_id"].nunique())
    v1 = _load_v1(args.out_dir, [a for a in results if a in tuning["algos"]])
    summary.write_text(
        _summary(results, tuning, calibration, selection, best, classes, n_persons, fitted, paths.root, v1), encoding="utf-8"
    )
    print(f"Best model ({selection}): {ALGO_NAMES[best]}. Wrote {summary} and metrics/confusion per method.")


if __name__ == "__main__":
    main()
