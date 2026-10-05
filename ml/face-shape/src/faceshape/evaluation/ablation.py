"""Step `make ablation`: feature/normalization ablations of the best algorithm (AC8).

The best algorithm (`training.selection`, same rule as evaluate/export - `shared.select_best`) keeps its best params; every variant is
scored with the same person-grouped CV on train+val (macro-F1). The test split is never read.
Variants: full features (baseline); (a) no roll alignment - features recomputed in memory from
`interim/landmarks.npz` with `align_roll=False` (the real parquet is not touched); (b) without the
length/width ratios; (c) without the jaw/chin angles; (d) without the contour features; (e) IPD
scaling instead of cheekbone width. Writes `<out-dir>/ablation.md`.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from app.ml.face_features import FEATURE_NAMES
from faceshape.features.build_features import features_for
from faceshape.common import DataPaths, build_parser, parse, require_file
from faceshape.training.shared import (
    ALGO_NAMES,
    build_estimator,
    cv_folds,
    cv_splitter,
    encode_target,
    fit_params,
    label_order,
    load_dataset,
    load_tuning,
    select_best,
)

LW_FEATURES = ("lw_ratio", "lw_ratio_ext")
ANGLE_FEATURES = ("jaw_angle_l", "jaw_angle_r", "jaw_angle_mean", "chin_angle")
CONTOUR_FEATURES = ("contour_curvature", "width_profile_slope", "symmetry")
# Features divided by the cheekbone width; (e) turns x / cheek into x / ipd via x/cheek / (ipd/cheek).
CHEEK_FEATURES = (
    "lw_ratio", "lw_ratio_ext", "forehead_cheek", "temple_cheek", "jaw_cheek", "jaw2_cheek",
    "width_profile_slope", "symmetry",
)


def _no_roll_features(paths: DataPaths, df: pd.DataFrame) -> pd.DataFrame:
    """`df` with its feature columns recomputed with `align_roll=False` (rows that fail are dropped)."""
    require_file(paths.landmarks_npz, "Run `make landmarks` first.")
    data = np.load(paths.landmarks_npz)
    # Read each npz array once - indexing `data[...]` inside the loop would re-read it every time.
    landmarks, widths, heights = data["landmarks"], data["width"], data["height"]
    index = {str(image_id): i for i, image_id in enumerate(data["image_id"])}
    rows = []
    for image_id in df["image_id"]:
        i = index[image_id]
        try:
            feats = features_for(landmarks[i], int(widths[i]), int(heights[i]), align_roll=False)
        except ValueError as exc:
            print(f"Skipping {image_id}: {exc}")
            continue
        rows.append({"image_id": image_id, **feats})
    recomputed = pd.DataFrame(rows, columns=["image_id", *FEATURE_NAMES])
    return df.drop(columns=list(FEATURE_NAMES)).merge(recomputed, on="image_id", how="inner")


def _ipd_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for name in CHEEK_FEATURES:
        out[name] = out[name] / out["ipd_cheek"]
    return out


def main() -> None:
    parser = build_parser("Ablation of the best algorithm (CV macro-F1 on train+val).")
    parser.add_argument("--out-dir", type=Path, default=Path("reports"), help="report folder (default: reports)")
    parser.add_argument("--cv-folds", type=int, default=None, help="override training.cv_folds")
    args, config, paths = parse(parser)
    from sklearn.model_selection import cross_val_score

    seed = int(config["training"]["seed"])
    n_folds = cv_folds(config, args.cv_folds)
    order = label_order(config)
    tuning = load_tuning(args.out_dir)
    algo = select_best(config, args.out_dir)
    params = tuning["algos"][algo]["best_params"]

    df = load_dataset(paths, ("train", "val"))
    ipd_names = [n for n in FEATURE_NAMES if n != "ipd_cheek"]
    variants: list[tuple[str, pd.DataFrame, list[str]]] = [
        ("Full features (baseline)", df, list(FEATURE_NAMES)),
        ("(a) No roll alignment", _no_roll_features(paths, df), list(FEATURE_NAMES)),
        ("(b) Without length/width ratios", df, [n for n in FEATURE_NAMES if n not in LW_FEATURES]),
        ("(c) Without jaw/chin angles", df, [n for n in FEATURE_NAMES if n not in ANGLE_FEATURES]),
        ("(d) Without contour features", df, [n for n in FEATURE_NAMES if n not in CONTOUR_FEATURES]),
        ("(e) IPD scaling instead of cheekbone width", _ipd_features(df), ipd_names),
    ]

    rows = []
    baseline = None
    for name, data, columns in variants:
        X = data[columns].to_numpy(dtype=np.float64)
        y = encode_target(algo, data["label"].to_numpy(dtype=str), order)
        scores = cross_val_score(
            build_estimator(algo, seed).set_params(**params), X, y,
            groups=data["person_id"].to_numpy(), cv=cv_splitter(n_folds, seed), scoring="f1_macro",
            n_jobs=-1, params=fit_params(algo, y),
        )
        mean = float(np.mean(scores))
        baseline = mean if baseline is None else baseline
        rows.append((name, len(data), len(columns), mean, float(np.std(scores)), mean - baseline))
        print(f"{name}: CV macro-F1 {mean:.4f} +/- {np.std(scores):.4f} ({len(columns)} features, {len(data)} images).")

    lines = [
        "# Ablation (E1)",
        "",
        f"Generated {date.today().isoformat()} from `{paths.root}` by `make ablation`. Numbers come from the "
        "pipeline outputs; do not edit by hand.",
        "",
        f"Algorithm: **{ALGO_NAMES[algo]}** (selected by `training.selection`: {config['training'].get('selection', 'tuning_cv')}) with its tuned params `{params}`. "
        f"Score: macro-F1 mean +/- std over {n_folds}-fold StratifiedGroupKFold by person on train+val "
        f"(seed {seed}); the test split is not used.",
        "",
        "| variant | images | features | CV macro F1 | std | delta vs full |",
        "|---|---|---|---|---|---|",
        *(f"| {n} | {i} | {f} | {m:.3f} | {s:.3f} | {d:+.3f} |" for n, i, f, m, s, d in rows),
        "",
        f"- (b) drops {', '.join(LW_FEATURES)}; (c) drops {', '.join(ANGLE_FEATURES)}; "
        f"(d) drops {', '.join(CONTOUR_FEATURES)}.",
        f"- (e) divides {', '.join(CHEEK_FEATURES)} by `ipd_cheek` (x/cheek / (ipd/cheek) = x/ipd) and drops "
        "`ipd_cheek`; the other features are scale-free and unchanged.",
        "- (a) recomputes all features from the saved landmarks without the eye-line roll alignment.",
        "- Differences smaller than the fold std are within CV noise.",
        "",
    ]
    out = args.out_dir / "ablation.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}.")


if __name__ == "__main__":
    main()
