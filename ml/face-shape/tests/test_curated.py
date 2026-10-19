"""`faceshape.dataset.curated`: synth-sources + build (plan 2026-10-18), main flow only."""
import csv
from argparse import Namespace
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from PIL import Image

from faceshape.common import DataPaths
from faceshape.dataset import curated
from faceshape.dataset.manifest import SOURCES_COLUMNS

CONFIG = {"classes": ["OVAL", "ROUND", "SQUARE", "HEART", "DIAMOND", "OBLONG"]}
MANIFEST_COLUMNS = [
    "file", "label", "origin", "source", "license", "original_file", "original_label",
    "source_image_id", "person_id", "gender", "score_d",
]


def _write_manifest(curated_dir: Path, rows: list[dict[str, str]]) -> None:
    curated_dir.mkdir(parents=True, exist_ok=True)
    with (curated_dir / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MANIFEST_COLUMNS, restval="")
        writer.writeheader()
        writer.writerows(rows)


def _write_root(root: Path, rows: list[tuple[str, str, str, str, str]], max_yaw: float = 30.0) -> None:
    """rows = (image_id, person_id, label, source, split) -> features.parquet, splits.csv, landmarks.npz."""
    paths = DataPaths(root)
    paths.processed.mkdir(parents=True)
    paths.interim.mkdir(parents=True)
    ids = [r[0] for r in rows]
    pd.DataFrame(
        {
            "image_id": ids,
            "person_id": [r[1] for r in rows],
            "label": [r[2] for r in rows],
            "source": [r[3] for r in rows],
            "jaw_ratio": np.arange(len(rows), dtype=float),
            "feature_schema_version": "2",
        }
    ).to_parquet(paths.features_parquet, index=False)
    pd.DataFrame(
        {"image_id": ids, "person_id": [r[1] for r in rows], "label": [r[2] for r in rows], "split": [r[4] for r in rows]}
    ).to_csv(paths.splits_csv, index=False)
    n = len(rows)
    np.savez_compressed(
        paths.landmarks_npz,
        image_id=np.array(ids, dtype="<U16"),
        landmarks=np.zeros((n, 478, 3), dtype=np.float32),
        width=np.full(n, 640, dtype=np.int32),
        height=np.full(n, 480, dtype=np.int32),
        matrix=np.zeros((n, 4, 4)),
        yaw=np.zeros(n),
        pitch=np.zeros(n),
        roll=np.zeros(n),
        max_yaw_deg=np.array(max_yaw),
    )


@pytest.fixture
def roots(tmp_path: Path) -> Namespace:
    base, synth, curated_dir = tmp_path / "data", tmp_path / "synth", tmp_path / "curated"
    _write_root(
        base,
        [
            ("real_train_cur", "p00001", "OVAL", "niten19", "train"),
            ("real_train_old", "p00002", "ROUND", "niten19", "train"),
            ("real_val", "p00003", "OVAL", "niten19", "val"),
            ("real_test", "p00004", "DIAMOND", "roboflow", "test"),
        ],
    )
    # Synthetic identity ids restart at p00000, so they would clash with real ids without the prefix.
    _write_root(
        synth,
        [
            ("synth_a", "p00001", "DIAMOND", curated.SYNTHETIC_SOURCE, "train"),
            ("synth_b", "p00001", "DIAMOND", curated.SYNTHETIC_SOURCE, "train"),
        ],
    )
    _write_manifest(
        curated_dir,
        [
            {"file": "OVAL/real-oval-001.jpg", "label": "OVAL", "origin": "real", "source_image_id": "real_train_cur", "person_id": "p00001"},
            {"file": "OVAL/real-oval-002.jpg", "label": "OVAL", "origin": "real", "source_image_id": "real_val", "person_id": "p00003"},
            {"file": "DIAMOND/synthetic-diamond-001.jpg", "label": "DIAMOND", "origin": "synthetic", "source_image_id": "diamond-001"},
        ],
    )
    return Namespace(base_dir=base, synth_dir=synth, curated_dir=curated_dir, out=tmp_path / "v2")


def _build(roots: Namespace, with_synthetic: bool, all_real_train: bool = False) -> DataPaths:
    args = Namespace(
        base_dir=roots.base_dir, synth_dir=roots.synth_dir, curated_dir=roots.curated_dir,
        with_synthetic=with_synthetic, all_real_train=all_real_train,
    )
    paths = DataPaths(roots.out)
    curated.build(args, CONFIG, paths)
    return paths


def test_build_real_only_keeps_curated_train_and_old_val_test(roots: Namespace) -> None:
    """AC3, AC4, AC6: train = curated old-train rows only; val/test = the old rows unchanged."""
    paths = _build(roots, with_synthetic=False)

    splits = pd.read_csv(paths.splits_csv, dtype=str)
    assert splits.to_dict("records") == [
        {"image_id": "real_train_cur", "person_id": "p00001", "label": "OVAL", "split": "train"},
        {"image_id": "real_val", "person_id": "p00003", "label": "OVAL", "split": "val"},
        {"image_id": "real_test", "person_id": "p00004", "label": "DIAMOND", "split": "test"},
    ]
    features = pd.read_parquet(paths.features_parquet)
    assert features["image_id"].tolist() == splits["image_id"].tolist()
    assert features["jaw_ratio"].tolist() == [0.0, 2.0, 3.0]  # base features reused, not recomputed
    npz = np.load(paths.landmarks_npz)
    assert npz["image_id"].tolist() == splits["image_id"].tolist()


def test_build_with_synthetic_adds_synthetic_rows_to_train_only(roots: Namespace) -> None:
    """AC2, AC5: synthetic rows join train with a `syn-` person_id; the npz covers every row."""
    paths = _build(roots, with_synthetic=True)

    splits = pd.read_csv(paths.splits_csv, dtype=str)
    synth = splits[splits["image_id"].str.startswith("synth_")]
    assert synth["split"].tolist() == ["train", "train"]
    assert synth["person_id"].tolist() == ["syn-p00001", "syn-p00001"]
    assert splits.loc[splits["split"] != "train", "image_id"].tolist() == ["real_val", "real_test"]
    features = pd.read_parquet(paths.features_parquet)
    assert features["person_id"].tolist() == splits["person_id"].tolist()
    npz = np.load(paths.landmarks_npz)
    assert npz["image_id"].tolist() == splits["image_id"].tolist()
    assert npz["landmarks"].dtype == np.float32
    assert float(npz["max_yaw_deg"]) == 30.0


def test_build_all_real_train_keeps_every_old_train_row_plus_synthetic(roots: Namespace) -> None:
    """AC13: model C train = every old-train real row (curated or not) + synthetic; val/test unchanged."""
    paths = _build(roots, with_synthetic=True, all_real_train=True)

    splits = pd.read_csv(paths.splits_csv, dtype=str)
    assert splits.loc[splits["split"] == "train", "image_id"].tolist() == [
        "real_train_cur", "real_train_old", "synth_a", "synth_b",
    ]
    assert splits.loc[splits["split"] != "train", "image_id"].tolist() == ["real_val", "real_test"]
    npz = np.load(paths.landmarks_npz)
    assert npz["image_id"].tolist() == splits["image_id"].tolist()


def test_build_fails_when_curated_real_image_is_not_in_base_features(roots: Namespace) -> None:
    """Error case: a curated real `source_image_id` missing from the base features."""
    _write_manifest(
        roots.curated_dir,
        [{"file": "OVAL/real-oval-009.jpg", "label": "OVAL", "origin": "real", "source_image_id": "unknown_id"}],
    )
    with pytest.raises(SystemExit):
        _build(roots, with_synthetic=False)
    assert not DataPaths(roots.out).splits_csv.exists()


def test_synth_sources_writes_synthetic_rows_and_all_kept_dedup(tmp_path: Path) -> None:
    """AC1, AC1b: only synthetic manifest rows -> sources.csv (SOURCES_COLUMNS) + every dedup row kept."""
    curated_dir = tmp_path / "curated"
    (curated_dir / "DIAMOND").mkdir(parents=True)
    # Two near-identical grey images: near-duplicate dedup would merge them, synth-sources must keep both.
    Image.new("RGB", (40, 50), (128, 128, 128)).save(curated_dir / "DIAMOND" / "synthetic-diamond-001.png")
    Image.new("RGB", (40, 50), (129, 128, 128)).save(curated_dir / "DIAMOND" / "synthetic-diamond-002.png")
    _write_manifest(
        curated_dir,
        [
            {"file": "OVAL/real-oval-001.jpg", "label": "OVAL", "origin": "real", "license": "CC BY 4.0", "source_image_id": "abc"},
            {"file": "DIAMOND/synthetic-diamond-001.png", "label": "DIAMOND", "origin": "synthetic", "license": "synthetic"},
            {"file": "DIAMOND/synthetic-diamond-002.png", "label": "DIAMOND", "origin": "synthetic", "license": "synthetic"},
        ],
    )
    paths = DataPaths(tmp_path / "v2" / "synth")

    curated.synth_sources(Namespace(curated_dir=curated_dir), CONFIG, paths)

    sources = pd.read_csv(paths.sources_csv, dtype=str, keep_default_na=False)
    assert list(sources.columns) == SOURCES_COLUMNS
    assert sources["path"].tolist() == [
        str(curated_dir / "DIAMOND" / "synthetic-diamond-001.png"),
        str(curated_dir / "DIAMOND" / "synthetic-diamond-002.png"),
    ]
    assert set(sources["source"]) == {curated.SYNTHETIC_SOURCE}
    assert set(sources["label"]) == {"DIAMOND"}
    dedup = pd.read_csv(paths.dedup_csv, dtype=str, keep_default_na=False)
    assert list(dedup.columns) == curated.DEDUP_COLUMNS
    assert set(dedup["status"]) == {"kept"}
    assert dedup["image_id"].tolist() == sources["image_id"].tolist()
    assert dedup["kept_image_id"].tolist() == dedup["image_id"].tolist()
    assert dedup["area"].tolist() == ["2000", "2000"]
