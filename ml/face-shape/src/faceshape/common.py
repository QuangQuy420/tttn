"""Shared CLI + config + path helpers for the face-shape dataset pipeline steps.

Every step is run as `python -m faceshape.<step> --config config.yaml --data-dir data` from
`ml/face-shape/` with `PYTHONPATH=../../face-processing-service:src` (see the Makefile).
`--data-dir` is the data root; `make sample` points it at `data/sample` so the sample run
never overwrites the full outputs.
"""
import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Label of a manifest/dedup row that survived deduplication.
KEPT = "kept"


@dataclass(frozen=True)
class DataPaths:
    """All pipeline files, relative to one data root (`--data-dir`)."""

    root: Path

    @property
    def raw(self) -> Path:
        return self.root / "raw"

    @property
    def interim(self) -> Path:
        return self.root / "interim"

    @property
    def review(self) -> Path:
        return self.interim / "review"

    @property
    def processed(self) -> Path:
        return self.root / "processed"

    @property
    def sources_csv(self) -> Path:
        return self.interim / "sources.csv"

    @property
    def manifest_rejections_csv(self) -> Path:
        return self.interim / "manifest_rejections.csv"

    @property
    def relabels_csv(self) -> Path:
        return self.review / "relabels.csv"

    @property
    def dedup_csv(self) -> Path:
        return self.interim / "dedup.csv"

    @property
    def identity_csv(self) -> Path:
        return self.interim / "identity.csv"

    @property
    def identity_calibration_json(self) -> Path:
        return self.interim / "identity_calibration.json"

    @property
    def landmarks_npz(self) -> Path:
        return self.interim / "landmarks.npz"

    @property
    def rejections_csv(self) -> Path:
        return self.interim / "rejections.csv"

    @property
    def features_parquet(self) -> Path:
        return self.processed / "features.parquet"

    @property
    def splits_csv(self) -> Path:
        return self.processed / "splits.csv"


def build_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--config", type=Path, default=Path("config.yaml"), help="pipeline config (YAML)")
    parser.add_argument("--data-dir", type=Path, default=Path("data"), help="data root (default: data)")
    return parser


def load_config(path: Path) -> dict[str, Any]:
    import yaml

    if not path.is_file():
        fail(f"Config file not found: {path}")
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def parse(parser: argparse.ArgumentParser) -> tuple[argparse.Namespace, dict[str, Any], DataPaths]:
    """Parse CLI args and return `(args, config, data paths)`."""
    args = parser.parse_args()
    return args, load_config(args.config), DataPaths(args.data_dir)


def require_file(path: Path, hint: str) -> None:
    """Exit with an actionable message when an upstream step's output is missing."""
    if not path.is_file():
        fail(f"Missing input {path}. {hint}")


def is_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)
