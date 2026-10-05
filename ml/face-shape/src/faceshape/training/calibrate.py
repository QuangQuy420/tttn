"""Step `make train` (2/2): refit the best params on train, calibrate on val (AC9).

For each tuned algorithm: fit its best params on **train**, then
`CalibratedClassifierCV(FrozenEstimator(fitted), method=training.calibration)` fitted on **val**
(sklearn 1.9 removed `cv="prefit"`). Saves `<data-dir>/models/<algo>_calibrated.joblib`, a
reliability diagram `<out-dir>/calibration_<algo>.png` and `<out-dir>/calibration.json` with the
multiclass Brier score (mean of the one-vs-rest Brier scores) before/after calibration on val.
The calibrator is fitted on val too, so the val "after" numbers are optimistic; evaluate.py
reports the test Brier score of the calibrated models.

Plan 2026-10-05: with `training.calibration_weight: balanced` the sigmoid is fitted with balanced
sample weights (n / (k * n_c) per class), so it keeps the model's class balancing instead of
re-learning val's real class frequencies (which made the calibrated SVM never predict DIAMOND).
`calibration.json` also records, per algorithm, the person-grouped CV macro-F1 of the whole
"fit + calibrate" pipeline on train+val (`cv_macro_f1_calibrated`), used to select the final
model (`training.selection: calibrated_cv`). The test split is never loaded.
"""
from __future__ import annotations

import json
import warnings
from pathlib import Path
from typing import Any

import numpy as np

from faceshape.common import build_parser, fail, parse
from faceshape.training.shared import (
    ALGO_NAMES,
    build_estimator,
    class_names,
    cv_folds,
    cv_splitter,
    encode_target,
    fit_params,
    label_order,
    load_dataset,
    load_tuning,
    model_path,
    xy,
)


def calibrate(model: Any, X_cal: np.ndarray, y_cal: np.ndarray, method: str, weight: str | None) -> Any:
    """`CalibratedClassifierCV` of the already fitted `model`, fitted on (X_cal, y_cal encoded).

    `weight == "balanced"` passes balanced sample weights to the calibration fit."""
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.frozen import FrozenEstimator
    from sklearn.model_selection import KFold
    from sklearn.utils.class_weight import compute_sample_weight

    sample_weight = compute_sample_weight("balanced", y_cal) if weight == "balanced" else None
    # The frozen model is never refit, so the CV split only routes calibration rows (same result as
    # the default split); plain KFold avoids StratifiedKFold's per-class minimum on a tiny set.
    calibrated = CalibratedClassifierCV(FrozenEstimator(model), method=method, cv=KFold(n_splits=2))
    with warnings.catch_warnings():
        # Expected: FrozenEstimator.fit takes no sample_weight - the weights are meant for the
        # sigmoid step only, and the frozen model is not refit anyway.
        warnings.filterwarnings("ignore", message="Since FrozenEstimator does not appear to accept sample_weight", category=UserWarning)
        calibrated.fit(X_cal, y_cal, sample_weight=sample_weight)
    return calibrated


def calibrated_cv_score(algo: str, params: dict[str, Any], X: np.ndarray, y: np.ndarray, groups: np.ndarray,
                        n_folds: int, seed: int, method: str, weight: str | None,
                        order: list[str]) -> tuple[float, float, int, int]:
    """Person-grouped CV macro-F1 of "fit + calibrate" on train+val:
    (mean, std, DIAMOND predictions, skipped folds).

    Outer folds = the tuning splits. In each outer-train part the first fold of the same splitter
    (grouped by person, stratified) is the calibration part, the rest fits the model. A fold is
    skipped when its calibration part has a class with < 2 rows (CalibratedClassifierCV's 2-fold
    split needs 2 per class) or a different class set than the fit part (the calibrator needs exactly
    the model's classes) - only happens on the tiny sample."""
    from sklearn.metrics import f1_score

    scores = []
    n_diamond = 0
    skipped = 0
    for fold, (train_idx, test_idx) in enumerate(cv_splitter(n_folds, seed).split(X, y, groups), start=1):
        fit_rel, cal_rel = next(cv_splitter(n_folds, seed).split(X[train_idx], y[train_idx], groups[train_idx]))
        fit_idx, cal_idx = train_idx[fit_rel], train_idx[cal_rel]
        counts = dict(zip(*np.unique(y[cal_idx], return_counts=True)))
        too_small = {str(c): int(n) for c, n in counts.items() if n < 2}
        mismatch = sorted(str(c) for c in set(counts) ^ set(y[fit_idx]))
        if too_small or mismatch:
            skipped += 1
            print(f"WARNING: {algo} calibrated CV fold {fold}/{n_folds} skipped - calibration part has < 2 rows of "
                  f"{too_small}; classes in only one of fit/calibration parts: {mismatch}.")
            continue
        y_fit = encode_target(algo, y[fit_idx], order)
        model = build_estimator(algo, seed).set_params(**params)
        model.fit(X[fit_idx], y_fit, **fit_params(algo, y_fit))
        calibrated = calibrate(model, X[cal_idx], encode_target(algo, y[cal_idx], order), method, weight)
        y_pred = np.asarray(class_names(calibrated, order))[calibrated.predict_proba(X[test_idx]).argmax(axis=1)]
        scores.append(f1_score(y[test_idx], y_pred, labels=order, average="macro", zero_division=0))
        n_diamond += int((y_pred == "DIAMOND").sum())
    if not scores:
        fail(f"{algo}: every calibrated CV fold was skipped (calibration parts too small) - use more data or fewer folds.")
    return float(np.mean(scores)), float(np.std(scores)), n_diamond, skipped


def multiclass_brier(y_true: np.ndarray, proba: np.ndarray, names: list[str]) -> float:
    """Mean over classes of the one-vs-rest Brier score."""
    from sklearn.metrics import brier_score_loss

    scores = [brier_score_loss((y_true == name).astype(int), proba[:, i], pos_label=1) for i, name in enumerate(names)]
    return float(np.mean(scores))


def _top_label_curve(y_true: np.ndarray, proba: np.ndarray, names: list[str], n_bins: int = 10) -> tuple[np.ndarray, np.ndarray]:
    """Reliability curve of the top-label confidence: (mean confidence, accuracy) per non-empty bin."""
    conf = proba.max(axis=1)
    correct = np.asarray(names)[proba.argmax(axis=1)] == y_true
    bins = np.minimum((conf * n_bins).astype(int), n_bins - 1)
    xs, ys = [], []
    for b in range(n_bins):
        mask = bins == b
        if mask.any():
            xs.append(conf[mask].mean())
            ys.append(correct[mask].mean())
    return np.asarray(xs), np.asarray(ys)


def _plot_reliability(curves: dict[str, tuple[np.ndarray, np.ndarray]], title: str, out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    colors = {"before": "#eb6834", "after": "#2a78d6"}
    fig, ax = plt.subplots(figsize=(4.8, 4.6), facecolor="#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    ax.plot([0, 1], [0, 1], color="#9a9a96", linewidth=1, linestyle="--", label="perfect")
    for label, (xs, ys) in curves.items():
        ax.plot(xs, ys, marker="o", color=colors[label], linewidth=2, markersize=4, label=f"{label} calibration")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("top-label confidence")
    ax.set_ylabel("accuracy")
    ax.set_title(title, loc="left")
    ax.grid(color="#e5e5e3", linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.legend(frameon=False, loc="upper left")
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def main() -> None:
    parser = build_parser("Refit the tuned models on train and calibrate them on val.")
    parser.add_argument("--out-dir", type=Path, default=Path("reports"), help="report folder (default: reports)")
    parser.add_argument("--cv-folds", type=int, default=None, help="override training.cv_folds")
    args, config, paths = parse(parser)
    import joblib

    cfg = config["training"]
    seed = int(cfg["seed"])
    method = str(cfg["calibration"])
    weight = cfg.get("calibration_weight")
    n_folds = cv_folds(config, args.cv_folds)
    order = label_order(config)
    tuning = load_tuning(args.out_dir)

    df = load_dataset(paths, ("train", "val"))
    X_train, y_train = xy(df[df["split"] == "train"])
    X_val, y_val = xy(df[df["split"] == "val"])
    X_all, y_all = xy(df)
    groups = df["person_id"].to_numpy()
    print(f"Refit on train ({len(y_train)}), calibrate ({method}, sample_weight={weight}) on val ({len(y_val)}).")

    paths.models.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "method": method, "sample_weight": weight, "evaluated_on": "val", "n_val": len(y_val),
        "cv_folds": n_folds, "seed": seed, "algos": {},
    }
    for algo, res in tuning["algos"].items():
        if res.get("status") != "trained":
            report["algos"][algo] = {"status": res.get("status")}
            continue
        y_fit = encode_target(algo, y_train, order)
        model = build_estimator(algo, seed).set_params(**res["best_params"])
        model.fit(X_train, y_fit, **fit_params(algo, y_fit))

        calibrated = calibrate(model, X_val, encode_target(algo, y_val, order), method, weight)
        joblib.dump(calibrated, model_path(paths, algo))

        names = class_names(calibrated, order)
        after = calibrated.predict_proba(X_val)
        curves = {}
        entry: dict[str, Any] = {"status": "calibrated", "brier_before": None, "brier_after": multiclass_brier(y_val, after, names)}
        if hasattr(model, "predict_proba"):
            before = model.predict_proba(X_val)
            before_names = class_names(model, order)
            entry["brier_before"] = multiclass_brier(y_val, before, before_names)
            curves["before"] = _top_label_curve(y_val, before, before_names)
        else:
            entry["note"] = "SVC(probability=False) has no probabilities before calibration (decision_function only)."
        cv_mean, cv_std, cv_diamond, cv_skipped = calibrated_cv_score(
            algo, res["best_params"], X_all, y_all, groups, n_folds, seed, method, weight, order
        )
        entry["cv_macro_f1_calibrated"] = cv_mean
        entry["cv_macro_f1_calibrated_std"] = cv_std
        entry["cv_diamond_predicted"] = cv_diamond
        entry["cv_folds_skipped"] = cv_skipped
        curves["after"] = _top_label_curve(y_val, after, names)
        _plot_reliability(curves, f"{ALGO_NAMES[algo]} - reliability (val)", args.out_dir / f"calibration_{algo}.png")
        report["algos"][algo] = entry
        before_text = "n/a" if entry["brier_before"] is None else f"{entry['brier_before']:.4f}"
        print(f"{ALGO_NAMES[algo]}: Brier (val) before {before_text}, after {entry['brier_after']:.4f}; "
              f"calibrated CV macro-F1 {cv_mean:.4f} +/- {cv_std:.4f} ({cv_diamond} DIAMOND predictions).")

    out = args.out_dir / "calibration.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {out}, calibration_<algo>.png and {paths.models}/<algo>_calibrated.joblib.")


if __name__ == "__main__":
    main()
