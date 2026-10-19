"""Steps `make curated-synth` / `make curated-data`: train sets from `data/inputs/curated` (plan 2026-10-18).

Two subcommands; the shared `--config` / `--data-dir` go before the subcommand:

- `--data-dir data/datasets/synth synth-sources --curated-dir data/inputs/curated`: the synthetic rows of
  `curated/manifest.csv` -> `interim/sources.csv` (`SOURCES_COLUMNS`, source `synthetic/gemini`) and
  an all-kept `interim/dedup.csv`. Near-duplicate dedup is skipped on purpose: the generated
  portraits share one plain grey background and pose, so dHash/pHash would group most of them and
  keep only a few. Only exact duplicates (same file SHA-1 `image_id`) fail the step. `make identity
  landmarks features` then run on that root as usual.
- `--data-dir data/datasets/<name> build --base-dir data/datasets/full-real --synth-dir data/datasets/synth
  [--with-synthetic] [--all-real-train]`:
  train = the curated real images whose old split is train (features + `person_id` taken from
  `<base>/processed/features.parquet`, joined on the manifest `source_image_id`, never on the
  curated file's SHA-1); val/test = every old val/test row, unchanged. `--with-synthetic` adds every
  synthetic feature row as train, with `person_id` prefixed `syn-`; `--all-real-train` keeps every
  old-train real row instead of the curated ones only (model C). Writes
  `processed/features.parquet`, `processed/splits.csv` and `interim/landmarks.npz` (the base + synth
  landmark rows of exactly these images, in `splits.csv` order) and fails on any person in two splits.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np

from faceshape.common import KEPT, DataPaths, build_parser, fail, parse, require_file
from faceshape.dataset.manifest import SOURCES_COLUMNS, _image_id
from faceshape.dataset.split import check_no_person_overlap

if TYPE_CHECKING:
    import pandas as pd

# `source` of synthetic rows; the `synthetic/` prefix is how build/compare tell them apart.
SYNTHETIC_SOURCE = "synthetic/gemini"
SYNTHETIC_PREFIX = "synthetic/"
SYNTHETIC_PERSON_PREFIX = "syn-"
DEDUP_COLUMNS = ["image_id", "path", "source", "label", "area", "dhash", "phash", "group", "status", "kept_image_id"]
# Per-row arrays of `landmarks.npz` and their dtypes (as written by `extract_landmarks.py`).
NPZ_ROW_DTYPES = {
    "image_id": "<U16",
    "landmarks": np.float32,
    "width": np.int32,
    "height": np.int32,
    "matrix": np.float64,
    "yaw": np.float64,
    "pitch": np.float64,
    "roll": np.float64,
}


def origin_of(source: str) -> str:
    """`synthetic` for rows written by `synth-sources`, else `real`."""
    return "synthetic" if str(source).startswith(SYNTHETIC_PREFIX) else "real"


def _load_manifest(curated_dir: Path) -> pd.DataFrame:
    import pandas as pd

    manifest = curated_dir / "manifest.csv"
    require_file(manifest, "Build data/inputs/curated first (see data/inputs/curated/README.md).")
    return pd.read_csv(manifest, dtype=str, keep_default_na=False)


def synth_sources(args: Any, config: dict[str, Any], paths: DataPaths) -> None:
    from PIL import Image

    manifest = _load_manifest(args.curated_dir)
    synth = manifest[manifest["origin"] == "synthetic"]
    if synth.empty:
        fail(f"No synthetic rows in {args.curated_dir / 'manifest.csv'}.")
    classes = set(config["classes"])

    sources: list[dict[str, str]] = []
    dedup: list[dict[str, Any]] = []
    seen: dict[str, str] = {}
    for row in synth.itertuples(index=False):
        if row.label not in classes:
            fail(f"{row.file}: label {row.label!r} is not in config classes {sorted(classes)}.")
        path = args.curated_dir / row.file
        require_file(path, "data/inputs/curated/manifest.csv lists a file that is not on disk.")
        image_id = _image_id(path)
        if image_id in seen:
            fail(f"Exact duplicate synthetic image: {path} has the same SHA-1 as {seen[image_id]} ({image_id}).")
        seen[image_id] = str(path)
        with Image.open(path) as img:
            area = img.width * img.height
        sources.append(
            {
                "image_id": image_id,
                "path": str(path),
                "source": SYNTHETIC_SOURCE,
                "source_url": "tool-generate-image",
                "license": row.license,
                "original_label": row.label,
                "label": row.label,
            }
        )
        dedup.append(
            {
                "image_id": image_id,
                "path": str(path),
                "source": SYNTHETIC_SOURCE,
                "label": row.label,
                "area": area,
                "dhash": "",
                "phash": "",
                "group": len(dedup),
                "status": KEPT,
                "kept_image_id": image_id,
            }
        )

    paths.interim.mkdir(parents=True, exist_ok=True)
    for out, columns, rows in ((paths.sources_csv, SOURCES_COLUMNS, sources), (paths.dedup_csv, DEDUP_COLUMNS, dedup)):
        with out.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
    counts: dict[str, int] = {}
    for row in sources:
        counts[row["label"]] = counts.get(row["label"], 0) + 1
    print(f"Wrote {len(sources)} synthetic rows to {paths.sources_csv}: {dict(sorted(counts.items()))}")
    print(f"Wrote {paths.dedup_csv}: all {len(dedup)} rows kept (near-duplicate dedup skipped, 0 exact duplicates).")


def _merge_landmarks(sources: list[tuple[Path, list[str]]], out: Path) -> None:
    """Rows of each `(npz, image_ids)` in order -> one npz; the 0-d `max_yaw_deg` must agree."""
    parts: dict[str, list[np.ndarray]] = {key: [] for key in NPZ_ROW_DTYPES}
    max_yaw: float | None = None
    for npz, image_ids in sources:
        data = np.load(npz)
        value = float(data["max_yaw_deg"])
        if max_yaw is not None and value != max_yaw:
            fail(f"{npz} has max_yaw_deg {value}, the other landmarks.npz has {max_yaw} - re-run `make landmarks`.")
        max_yaw = value
        index = {str(image_id): i for i, image_id in enumerate(data["image_id"])}
        missing = [i for i in image_ids if i not in index]
        if missing:
            fail(f"{len(missing)} images have no landmarks in {npz}: {missing[:5]}")
        rows = [index[i] for i in image_ids]
        for key, dtype in NPZ_ROW_DTYPES.items():
            parts[key].append(np.asarray(data[key])[rows].astype(dtype))
    merged = {key: np.concatenate(values) for key, values in parts.items()}
    np.savez_compressed(out, **merged, max_yaw_deg=np.array(max_yaw))


def build(args: Any, config: dict[str, Any], paths: DataPaths) -> None:
    import pandas as pd

    base = DataPaths(args.base_dir)
    synth_paths = DataPaths(args.synth_dir)
    for path, hint in (
        (base.features_parquet, "Run `make features` on the base data first."),
        (base.splits_csv, "Run `make split` on the base data first."),
        (base.landmarks_npz, "Run `make landmarks` on the base data first."),
    ):
        require_file(path, hint)
    if args.with_synthetic:
        require_file(synth_paths.features_parquet, "Run `make curated-synth` first.")
        require_file(synth_paths.landmarks_npz, "Run `make curated-synth` first.")

    manifest = _load_manifest(args.curated_dir)
    real = manifest[manifest["origin"] == "real"]
    base_features = pd.read_parquet(base.features_parquet)
    columns = list(base_features.columns)
    base_features["feature_schema_version"] = base_features["feature_schema_version"].astype(str)
    if base_features["image_id"].duplicated().any():
        fail(f"{base.features_parquet} has duplicate image_id rows.")
    base_splits = pd.read_csv(base.splits_csv, dtype=str)

    feature_ids = set(base_features["image_id"])
    missing = real.loc[~real["source_image_id"].isin(feature_ids), "source_image_id"].tolist()
    if missing:
        fail(f"{len(missing)} curated real images are not in {base.features_parquet}: {missing[:5]}")
    curated_ids = set(real["source_image_id"])
    split_of = dict(zip(base_splits["image_id"], base_splits["split"]))
    no_split = sorted(curated_ids - set(split_of))
    if no_split:
        fail(f"{len(no_split)} curated real images are not in {base.splits_csv}: {no_split[:5]}")
    labels = base_features.set_index("image_id")["label"]
    wrong = real[real["label"].to_numpy() != labels.loc[real["source_image_id"]].to_numpy()]
    if len(wrong):
        fail(f"{len(wrong)} curated real images have another label than {base.features_parquet}: {wrong['file'].tolist()[:5]}")

    # Real rows in the old splits.csv order: curated old-train rows (every old-train row with
    # `--all-real-train`) + every old val/test row.
    train = base_splits["split"] == "train"
    if not args.all_real_train:
        train &= base_splits["image_id"].isin(curated_ids)
    keep = base_splits["split"].isin(["val", "test"]) | train
    real_splits = base_splits[keep].reset_index(drop=True)
    real_features = base_features.set_index("image_id").loc[real_splits["image_id"]].reset_index()
    mismatch = (real_features["person_id"].to_numpy() != real_splits["person_id"].to_numpy()) | (
        real_features["label"].to_numpy() != real_splits["label"].to_numpy()
    )
    if mismatch.any():
        fail(f"{int(mismatch.sum())} rows differ in person_id/label between {base.features_parquet} and {base.splits_csv}.")
    frames = [real_features[columns]]
    split_values = real_splits["split"].tolist()
    npz_sources = [(base.landmarks_npz, real_splits["image_id"].tolist())]

    if args.with_synthetic:
        synth = pd.read_parquet(synth_paths.features_parquet)
        synth["feature_schema_version"] = synth["feature_schema_version"].astype(str)
        versions = set(base_features["feature_schema_version"]), set(synth["feature_schema_version"])
        if versions[0] != versions[1]:
            fail(f"feature_schema_version differs: base {sorted(versions[0])}, synthetic {sorted(versions[1])}.")
        not_synth = synth.loc[~synth["source"].astype(str).str.startswith(SYNTHETIC_PREFIX), "image_id"].tolist()
        if not_synth:
            fail(f"{len(not_synth)} rows of {synth_paths.features_parquet} are not synthetic: {not_synth[:5]}")
        synth["person_id"] = SYNTHETIC_PERSON_PREFIX + synth["person_id"].astype(str)
        frames.append(synth[columns])
        split_values += ["train"] * len(synth)
        npz_sources.append((synth_paths.landmarks_npz, synth["image_id"].tolist()))

    features = pd.concat(frames, ignore_index=True)
    if features["image_id"].duplicated().any():
        dupes = features.loc[features["image_id"].duplicated(), "image_id"].tolist()
        fail(f"{len(dupes)} image_ids appear twice in the merged features: {dupes[:5]}")
    splits = features[["image_id", "person_id", "label"]].copy()
    splits["split"] = split_values
    check_no_person_overlap(splits)

    paths.processed.mkdir(parents=True, exist_ok=True)
    paths.interim.mkdir(parents=True, exist_ok=True)
    features.to_parquet(paths.features_parquet, index=False)
    splits.to_csv(paths.splits_csv, index=False)
    _merge_landmarks(npz_sources, paths.landmarks_npz)
    npz_ids = set(str(i) for i in np.load(paths.landmarks_npz)["image_id"])
    if not set(splits["image_id"]) <= npz_ids:
        fail(f"{paths.landmarks_npz} does not cover every row of {paths.splits_csv}.")

    splits["origin"] = features["source"].map(origin_of)
    table = pd.crosstab(splits["label"], [splits["split"], splits["origin"]], margins=True)
    print(
        f"Wrote {len(features)} rows to {paths.features_parquet}, {paths.splits_csv} and {paths.landmarks_npz} "
        f"(real train: {'all old train' if args.all_real_train else 'curated'}; "
        f"synthetic: {'yes' if args.with_synthetic else 'no'}; 0 person overlap between splits):\n{table}"
    )


def main() -> None:
    parser = build_parser("Build datasets from data/inputs/curated (synthetic sources, merged train sets).")
    commands = parser.add_subparsers(dest="command", required=True)
    synth = commands.add_parser("synth-sources", help="synthetic manifest rows -> interim/sources.csv + all-kept dedup.csv")
    synth.add_argument("--curated-dir", type=Path, default=Path("data/inputs/curated"), help="curated dataset folder")
    merged = commands.add_parser("build", help="curated real train rows (+ synthetic) + old val/test -> processed/")
    merged.add_argument(
        "--base-dir", type=Path, default=Path("data/datasets/full-real"),
        help="dataset of the old split (default: data/datasets/full-real)",
    )
    merged.add_argument("--synth-dir", type=Path, default=Path("data/datasets/synth"), help="dataset of `make curated-synth`")
    merged.add_argument("--curated-dir", type=Path, default=Path("data/inputs/curated"), help="curated dataset folder")
    merged.add_argument("--with-synthetic", action="store_true", help="add every synthetic image to train")
    merged.add_argument(
        "--all-real-train", action="store_true", help="train on every old-train real image, not only the curated ones"
    )
    args, config, paths = parse(parser)
    if args.command == "synth-sources":
        synth_sources(args, config, paths)
    else:
        build(args, config, paths)


if __name__ == "__main__":
    main()
