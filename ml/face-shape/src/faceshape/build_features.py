"""Step `make features`: 20 geometric features per image -> `processed/features.parquet`.

Uses the shared face-processing-service module (train/serve parity, AC10):
`compute_features(normalize(to_pixels(landmarks, width, height), align_roll=...))`.
Columns: `image_id, person_id, label, source, <FEATURE_NAMES>, feature_schema_version`.
"""
import numpy as np

from app.ml.face_features import FEATURE_NAMES, FEATURE_SCHEMA_VERSION, compute_features, normalize, to_pixels
from faceshape.common import KEPT, build_parser, parse, require_file


def features_for(landmarks: np.ndarray, width: int, height: int, align_roll: bool) -> dict[str, float]:
    return compute_features(normalize(to_pixels(landmarks, width, height), align_roll=align_roll))


def main() -> None:
    parser = build_parser("Compute the geometric face-shape features -> processed/features.parquet.")
    _, config, paths = parse(parser)
    import pandas as pd

    require_file(paths.landmarks_npz, "Run `make landmarks` first.")
    require_file(paths.identity_csv, "Run `make identity` first.")
    align_roll = bool(config["features"]["align_roll"])

    data = np.load(paths.landmarks_npz)
    rows = []
    for image_id, landmarks, width, height in zip(data["image_id"], data["landmarks"], data["width"], data["height"]):
        try:
            feats = features_for(landmarks, int(width), int(height), align_roll)
        except ValueError as exc:
            print(f"Skipping {image_id}: {exc}")
            continue
        rows.append({"image_id": str(image_id), **feats})
    feats_df = pd.DataFrame(rows, columns=["image_id", *FEATURE_NAMES])

    identity = pd.read_csv(paths.identity_csv, dtype={"image_id": str, "person_id": str})
    dedup = pd.read_csv(paths.dedup_csv, dtype=str)
    meta = dedup[dedup["status"] == KEPT][["image_id", "label", "source"]].drop_duplicates("image_id")
    df = feats_df.merge(identity[["image_id", "person_id"]], on="image_id", how="left").merge(
        meta, on="image_id", how="left"
    )
    missing = df["person_id"].isna().sum()
    if missing:
        raise SystemExit(f"ERROR: {missing} images have no person_id - re-run `make identity` after `make dedup`.")
    df["feature_schema_version"] = FEATURE_SCHEMA_VERSION
    df = df[["image_id", "person_id", "label", "source", *FEATURE_NAMES, "feature_schema_version"]]

    paths.processed.mkdir(parents=True, exist_ok=True)
    df.to_parquet(paths.features_parquet, index=False)
    print(f"Wrote {len(df)} rows x {len(FEATURE_NAMES)} features to {paths.features_parquet}.")


if __name__ == "__main__":
    main()
