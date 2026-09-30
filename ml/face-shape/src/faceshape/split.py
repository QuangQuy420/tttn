"""Step `make split`: identity-aware, class-stratified ~70/15/15 split -> `processed/splits.csv`.

Two stages of `StratifiedGroupKFold` (groups = `person_id`, seeded): one fold of
~1/`test_size` folds becomes test, then one fold of the rest becomes validation. The run fails
if any `person_id` appears in more than one split.

Whole persons move between splits, so a small class with a few large persons (DIAMOND) can end up
lopsided. `balance_trials` candidate seeds (seed, seed+1, ...) are tried and the split whose
per-class shares are closest to the target (smallest max |share - target|) is kept. The choice
uses only label counts, never model results, and the chosen seed is logged.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from faceshape.common import build_parser, parse, require_file

if TYPE_CHECKING:
    import numpy as np
    import pandas as pd


def _one_fold(labels: pd.Series, groups: pd.Series, n_splits: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """Indices `(rest, held_out)` of the first fold of a seeded StratifiedGroupKFold."""
    from sklearn.model_selection import StratifiedGroupKFold

    cv = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    return next(cv.split(labels, labels, groups))


def assign_splits(df: pd.DataFrame, val_size: float, test_size: float, seed: int) -> pd.DataFrame:
    """Return a copy of `df` (needs `label`, `person_id`) with a `split` column."""
    df = df.reset_index(drop=True).copy()
    n_test = max(2, round(1 / test_size))
    rest, test = _one_fold(df["label"], df["person_id"], n_test, seed)
    n_val = max(2, round((1 - test_size) / val_size))
    rest_df = df.iloc[rest]
    _, val_pos = _one_fold(rest_df["label"], rest_df["person_id"], n_val, seed)

    df["split"] = "train"
    df.loc[df.index[test], "split"] = "test"
    df.loc[rest_df.index[val_pos], "split"] = "val"
    return df


def class_share_deviation(df: pd.DataFrame, val_size: float, test_size: float) -> float:
    """Largest |per-class split share - target share| over all classes and splits."""
    import pandas as pd

    shares = pd.crosstab(df["label"], df["split"], normalize="index")
    target = {"train": 1 - val_size - test_size, "val": val_size, "test": test_size}
    return float(max((shares.get(name, 0.0) - share).abs().max() for name, share in target.items()))


def balanced_splits(
    df: pd.DataFrame, val_size: float, test_size: float, seed: int, trials: int
) -> tuple[pd.DataFrame, int, float]:
    """Best of `trials` seeded splits by `class_share_deviation` -> `(df, seed, deviation)`."""
    best: tuple[pd.DataFrame, int, float] | None = None
    for candidate in range(seed, seed + max(1, trials)):
        split = assign_splits(df, val_size, test_size, candidate)
        deviation = class_share_deviation(split, val_size, test_size)
        if best is None or deviation < best[2]:
            best = (split, candidate, deviation)
    assert best is not None
    return best


def check_no_person_overlap(df: pd.DataFrame) -> None:
    splits = {name: set(group["person_id"]) for name, group in df.groupby("split")}
    names = sorted(splits)
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            overlap = splits[a] & splits[b]
            if overlap:
                raise SystemExit(f"ERROR: {len(overlap)} person_id(s) appear in both {a} and {b}: {sorted(overlap)[:5]}")


def main() -> None:
    parser = build_parser("Identity-aware stratified train/val/test split -> processed/splits.csv.")
    _, config, paths = parse(parser)
    import pandas as pd

    require_file(paths.features_parquet, "Run `make features` first.")
    cfg = config["split"]

    features = pd.read_parquet(paths.features_parquet, columns=["image_id", "person_id", "label"])
    val_size, test_size = float(cfg["val_size"]), float(cfg["test_size"])
    trials = int(cfg.get("balance_trials", 1))
    df, seed, deviation = balanced_splits(features, val_size, test_size, int(cfg["seed"]), trials)
    check_no_person_overlap(df)
    print(f"Chosen seed {seed} of {trials} tried (max per-class share deviation {deviation:.3f}).")

    df[["image_id", "person_id", "label", "split"]].to_csv(paths.splits_csv, index=False)
    table = pd.crosstab(df["label"], df["split"], margins=True)
    print(f"Wrote {paths.splits_csv} (0 person overlap between splits):\n{table}")
    print((df["split"].value_counts(normalize=True).round(3)).to_string())


if __name__ == "__main__":
    main()
