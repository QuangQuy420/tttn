"""Step `make train` (2/2): refit the best params on train, calibrate on val (AC9).

For each tuned algorithm: fit its best params on **train**, then
`CalibratedClassifierCV(FrozenEstimator(fitted), method=training.calibration)` fitted on **val**
(sklearn 1.9 removed `cv="prefit"`). Saves `<data-dir>/models/<algo>_calibrated.joblib`, a
reliability diagram `<out-dir>/calibration_<algo>.png` and `<out-dir>/calibration.json` with the
multiclass Brier score (mean of the one-vs-rest Brier scores) before/after calibration on val.
The calibrator is fitted on val too, so the val "after" numbers are optimistic; evaluate.py
reports the test Brier score of the calibrated models.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from faceshape.common import build_parser, parse
from faceshape.training.shared import (
    ALGO_NAMES,
    build_estimator,
    class_names,
    encode_target,
    fit_params,
    label_order,
    load_dataset,
    load_tuning,
    model_path,
    xy,
)


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
    args, config, paths = parse(parser)
    import joblib
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.frozen import FrozenEstimator
    from sklearn.model_selection import KFold

    cfg = config["training"]
    seed = int(cfg["seed"])
    method = str(cfg["calibration"])
    order = label_order(config)
    tuning = load_tuning(args.out_dir)

    df = load_dataset(paths, ("train", "val"))
    X_train, y_train = xy(df[df["split"] == "train"])
    X_val, y_val = xy(df[df["split"] == "val"])
    print(f"Refit on train ({len(y_train)}), calibrate ({method}) on val ({len(y_val)}).")

    paths.models.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {"method": method, "evaluated_on": "val", "n_val": len(y_val), "algos": {}}
    for algo, res in tuning["algos"].items():
        if res.get("status") != "trained":
            report["algos"][algo] = {"status": res.get("status")}
            continue
        y_fit = encode_target(algo, y_train, order)
        model = build_estimator(algo, seed).set_params(**res["best_params"])
        model.fit(X_train, y_fit, **fit_params(algo, y_fit))

        # The frozen model is never refit, so the CV split only routes val rows (same result as the
        # default split); plain KFold avoids StratifiedKFold's per-class minimum on a tiny val set.
        calibrated = CalibratedClassifierCV(FrozenEstimator(model), method=method, cv=KFold(n_splits=2))
        calibrated.fit(X_val, encode_target(algo, y_val, order))
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
        curves["after"] = _top_label_curve(y_val, after, names)
        _plot_reliability(curves, f"{ALGO_NAMES[algo]} - reliability (val)", args.out_dir / f"calibration_{algo}.png")
        report["algos"][algo] = entry
        before_text = "n/a" if entry["brier_before"] is None else f"{entry['brier_before']:.4f}"
        print(f"{ALGO_NAMES[algo]}: Brier (val) before {before_text}, after {entry['brier_after']:.4f}.")

    out = args.out_dir / "calibration.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {out}, calibration_<algo>.png and {paths.models}/<algo>_calibrated.joblib.")


if __name__ == "__main__":
    main()
