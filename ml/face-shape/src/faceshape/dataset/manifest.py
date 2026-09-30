"""Step `make manifest`: one manifest over every raw source -> `interim/sources.csv`.

- Label = name of the image's parent (class) folder. The niten19 train/test folders are merged:
  the original split is discarded (we re-split by identity in `split.py`).
- Labels are mapped with `class_map` (case-insensitive; e.g. Rectangle -> OBLONG); `drop_labels`
  and unknown labels are removed. A source's optional `keep_classes` limits which classes it adds.
- `image_id` = first 16 hex chars of the file's SHA-1 (stable across runs).
- Non-images (e.g. `desktop.ini`) are ignored; unreadable images are logged as `decode_error`.
- `review/relabels.csv` (`image_id,new_label`, new_label = a class or DROP) is applied if present.

Removed files are written to `interim/manifest_rejections.csv` (path, reason) for the dataset card.
"""
import csv
import hashlib
from pathlib import Path
from typing import Any

from faceshape.common import build_parser, is_image, parse

SOURCES_COLUMNS = ["image_id", "path", "source", "source_url", "license", "original_label", "label"]


def _image_id(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:16]


def _decodes(path: Path) -> bool:
    from PIL import Image, ImageFile

    ImageFile.LOAD_TRUNCATED_IMAGES = True
    try:
        with Image.open(path) as img:
            img.load()
        return True
    except Exception:
        return False


def _source_roots(config: dict[str, Any], raw_dir: Path) -> list[tuple[str, Path, dict[str, Any]]]:
    """`(source name, folder, source config)` for every configured source present on disk."""
    kaggle = config["sources"]["kaggle"]
    roots = [("niten19", raw_dir / kaggle["dir"], kaggle)]
    for ds in config["sources"].get("kaggle_extra") or []:
        roots.append((f"kaggle/{ds['dir']}", raw_dir / ds["dir"], ds))
    for ds in config["sources"].get("roboflow") or []:
        roots.append((f"roboflow/{ds['slug']}", raw_dir / "roboflow" / ds["slug"], ds))
    return roots


def _load_relabels(path: Path, classes: list[str]) -> dict[str, str]:
    if not path.is_file():
        return {}
    relabels: dict[str, str] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            new_label = row["new_label"].strip().upper()
            if new_label != "DROP" and new_label not in classes:
                raise SystemExit(f"ERROR: {path}: unknown new_label {row['new_label']!r} for {row['image_id']}.")
            relabels[row["image_id"].strip()] = new_label
    print(f"Applying {len(relabels)} manual relabels from {path}.")
    return relabels


def main() -> None:
    parser = build_parser("Build interim/sources.csv from all raw sources (label mapping + relabels).")
    _, config, paths = parse(parser)
    class_map = {k.lower(): v for k, v in config["class_map"].items()}
    drop_labels = {label.lower() for label in config["drop_labels"]}
    relabels = _load_relabels(paths.relabels_csv, config["classes"])

    rows: list[dict[str, str]] = []
    rejections: list[dict[str, str]] = []
    for source, root, source_cfg in _source_roots(config, paths.raw):
        if not root.is_dir():
            print(f"[{source}] {root} not found - source skipped (run `make download`).")
            continue
        keep_classes = set(source_cfg.get("keep_classes") or config["classes"])
        found = 0
        for path in sorted(p for p in root.rglob("*") if is_image(p)):
            original_label = path.parent.name
            key = original_label.strip().lower()
            if key in drop_labels:
                rejections.append({"path": str(path), "reason": "dropped_label", "detail": original_label})
                continue
            if key not in class_map:
                rejections.append({"path": str(path), "reason": "unknown_label", "detail": original_label})
                continue
            if class_map[key] not in keep_classes:
                rejections.append({"path": str(path), "reason": "class_not_kept", "detail": original_label})
                continue
            if not _decodes(path):
                rejections.append({"path": str(path), "reason": "decode_error", "detail": ""})
                continue
            image_id = _image_id(path)
            label = relabels.get(image_id, class_map[key])
            if label == "DROP":
                rejections.append({"path": str(path), "reason": "relabel_drop", "detail": image_id})
                continue
            rows.append(
                {
                    "image_id": image_id,
                    "path": str(path),
                    "source": source,
                    "source_url": source_cfg["source_url"],
                    "license": source_cfg["license"],
                    "original_label": original_label,
                    "label": label,
                }
            )
            found += 1
        print(f"[{source}] {found} images kept.")

    if not rows:
        raise SystemExit("ERROR: no images found under the raw sources. Run `make download` first.")

    paths.interim.mkdir(parents=True, exist_ok=True)
    with paths.sources_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=SOURCES_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    with paths.manifest_rejections_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "reason", "detail"])
        writer.writeheader()
        writer.writerows(rejections)

    counts: dict[str, int] = {}
    for row in rows:
        counts[row["label"]] = counts.get(row["label"], 0) + 1
    print(f"Wrote {len(rows)} rows to {paths.sources_csv}: {dict(sorted(counts.items()))}")
    print(f"{len(rejections)} files removed (see {paths.manifest_rejections_csv}).")


if __name__ == "__main__":
    main()
