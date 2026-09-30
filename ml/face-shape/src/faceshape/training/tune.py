"""Step `make train` (1/2): grid-search each algorithm with person-grouped CV (AC4).

`GridSearchCV(scoring="f1_macro")` with `StratifiedGroupKFold(shuffle, seed)` over train+val,
`groups = person_id`. Test rows are never read. Writes `<out-dir>/tuning_<algo>.csv` (every
`cv_results_` row) and `<out-dir>/tuning.json` (best params + `cv_macro_f1` per algorithm).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from faceshape.common import build_parser, parse
from faceshape.training.shared import (
    ALGO_NAMES,
    TRAINED_ALGOS,
    XGB_NOT_INSTALLED,
    available_algos,
    build_estimator,
    cv_folds,
    cv_splitter,
    encode_target,
    fit_params,
    label_order,
    load_dataset,
    tuning_path,
    xy,
)


def _json_value(value: object) -> object:
    """numpy scalars -> plain Python for json."""
    return value.item() if isinstance(value, np.generic) else value


def main() -> None:
    parser = build_parser("Tune SVM / Random Forest / XGBoost with person-grouped CV on train+val.")
    parser.add_argument("--out-dir", type=Path, default=Path("reports"), help="report folder (default: reports)")
    parser.add_argument("--cv-folds", type=int, default=None, help="override training.cv_folds")
    args, config, paths = parse(parser)
    from sklearn.model_selection import GridSearchCV

    cfg = config["training"]
    seed = int(cfg["seed"])
    n_folds = cv_folds(config, args.cv_folds)
    order = label_order(config)

    df = load_dataset(paths, ("train", "val"))
    X, y = xy(df)
    groups = df["person_id"].to_numpy()
    print(f"Tuning on train+val: {len(df)} images, {len(set(groups))} persons, {n_folds} grouped folds.")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    result: dict[str, object] = {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": seed,
        "cv_folds": n_folds,
        "scoring": "f1_macro",
        "n_images": len(df),
        "n_persons": int(len(set(groups))),
        "algos": {},
    }
    algos = available_algos()
    for algo in TRAINED_ALGOS:
        if algo not in algos:
            result["algos"][algo] = {"name": ALGO_NAMES[algo], "status": XGB_NOT_INSTALLED}
            print(f"{ALGO_NAMES[algo]}: {XGB_NOT_INSTALLED}.")
            continue
        y_fit = encode_target(algo, y, order)
        search = GridSearchCV(
            build_estimator(algo, seed),
            param_grid=cfg["grids"][algo],
            scoring="f1_macro",
            cv=cv_splitter(n_folds, seed),
            n_jobs=-1,
            refit=False,
        )
        search.fit(X, y_fit, groups=groups, **fit_params(algo, y_fit))

        cv_results = pd.DataFrame(search.cv_results_).sort_values("rank_test_score")
        cv_results.to_csv(args.out_dir / f"tuning_{algo}.csv", index=False)
        best = search.best_index_
        best_score = float(search.cv_results_["mean_test_score"][best])
        result["algos"][algo] = {
            "name": ALGO_NAMES[algo],
            "status": "trained",
            "best_params": {k: _json_value(v) for k, v in search.best_params_.items()},
            "cv_macro_f1": best_score,
            "cv_macro_f1_std": float(search.cv_results_["std_test_score"][best]),
            "n_candidates": len(cv_results),
        }
        print(f"{ALGO_NAMES[algo]}: CV macro-F1 {best_score:.4f} with {search.best_params_}.")

    out = tuning_path(args.out_dir)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Wrote {out} and tuning_<algo>.csv.")


if __name__ == "__main__":
    main()
