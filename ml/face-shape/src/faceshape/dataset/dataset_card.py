"""Step `make card`: dataset card `reports/dataset_card.md` + `reports/class_balance.png`.

Summarizes every step's outputs: counts per class per split, DIAMOND vs the required minimum,
imbalance ratio, dedup / identity / rejection stats, sources + licenses and known limitations.
Only `processed/splits.csv` is required; missing upstream files are reported as "n/a"
(e.g. `make sample` never re-runs `manifest`, so it has no manifest rejections).
`--out-dir` lets `make sample` write its card under `data/sample/reports/`.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING, Any

from faceshape.common import build_parser, parse, require_file

if TYPE_CHECKING:
    import pandas as pd

# Categorical slots 1-3 (validated light-surface palette) for train / val / test.
_SPLIT_COLORS = {"train": "#2a78d6", "val": "#eb6834", "test": "#1baf7a"}
_SPLITS = ["train", "val", "test"]


def _read_csv(path: Path) -> pd.DataFrame | None:
    import pandas as pd

    return pd.read_csv(path, dtype=str) if path.is_file() else None


def _md_table(df: pd.DataFrame) -> str:
    header = "| " + " | ".join(str(c) for c in df.columns) + " |"
    sep = "|" + "---|" * len(df.columns)
    rows = ["| " + " | ".join(str(v) for v in row) + " |" for row in df.itertuples(index=False)]
    return "\n".join([header, sep, *rows])


def _counts_table(splits: pd.DataFrame, classes: list[str]) -> pd.DataFrame:
    import pandas as pd

    table = pd.crosstab(splits["label"], splits["split"]).reindex(index=classes, columns=_SPLITS, fill_value=0)
    table["total"] = table.sum(axis=1)
    table.loc["TOTAL"] = table.sum()
    return table


def _plot_balance(table: pd.DataFrame, classes: list[str], out: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    x = np.arange(len(classes))
    width = 0.26
    fig, ax = plt.subplots(figsize=(8, 4.2), facecolor="#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    for i, split in enumerate(_SPLITS):
        ax.bar(
            x + (i - 1) * width, table.loc[classes, split], width - 0.02,
            label=split, color=_SPLIT_COLORS[split], edgecolor="#fcfcfb", linewidth=1,
        )
    ax.set_xticks(x, classes)
    ax.set_ylabel("images")
    ax.set_title("Images per class and split", loc="left")
    ax.grid(axis="y", color="#e5e5e3", linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.legend(frameon=False, ncols=3, loc="lower right", bbox_to_anchor=(1, 1))
    fig.tight_layout()
    fig.savefig(out, dpi=150)
    plt.close(fig)


def _threshold_summary(path: Path) -> str:
    if not path.is_file():
        return "clustering threshold n/a (no identity_calibration.json)."
    stats = json.loads(path.read_text(encoding="utf-8"))
    text = f"cosine threshold used {stats['threshold_used']:.3f} (configured: {stats['configured_threshold']})"
    if "suggested_threshold" in stats:
        text += (
            f"; suggested from the null distribution (p{stats['calibration_percentile']:g} of "
            f"{stats['null_pairs']} random pairs) {stats['suggested_threshold']:.3f}; "
            f"{stats['null_share_below_used']:.2%} of random pairs fall below the used threshold"
        )
    return text + "."


def _sources_section(sources: pd.DataFrame | None, config: dict[str, Any]) -> list[str]:
    lines = ["## Sources and licenses", ""]
    if sources is None:
        lines.append("n/a (no `interim/sources.csv` in this data dir).")
        return lines
    summary = sources.groupby(["source", "license", "source_url"]).size().reset_index(name="images")
    lines += [_md_table(summary), ""]
    present = set(sources["source"])
    expected = [(f"kaggle/{ds['dir']}", ds) for ds in config["sources"].get("kaggle_extra") or []]
    expected += [(f"roboflow/{ds['slug']}", ds) for ds in config["sources"].get("roboflow") or []]
    for name, ds in expected:
        if name not in present:
            lines.append(f"- **Missing source:** `{name}` ({ds['source_url']}) was not downloaded - DIAMOND may be under-represented.")
    lines += [
        "- niten19 (Kaggle): license unclear (scraped celebrity images) -> **research use only**; "
        "the original train/test split was discarded and re-split by identity.",
        "- Extra Kaggle DIAMOND sources (minhquangbui, lucifierx): no license stated -> **research use only**.",
        "- Roboflow Universe exports are CC BY 4.0 -> attribution required. Per-image source URL and "
        "license are in `interim/sources.csv`. Attribution list:",
    ]
    for ds in config["sources"].get("roboflow") or []:
        version = f" v{ds['version']}" if ds.get("version") is not None else " (version not set - manual export)"
        lines.append(f"  - {ds['workspace']}/{ds['project']}{version} - {ds['source_url']} ({ds['license']})")
    return lines


def main() -> None:
    parser = build_parser("Write the dataset card (markdown + class balance chart).")
    parser.add_argument("--out-dir", type=Path, default=Path("reports"), help="output folder (default: reports)")
    args, config, paths = parse(parser)
    require_file(paths.splits_csv, "Run `make split` first.")
    classes: list[str] = config["classes"]
    diamond_min = int(config["card"]["diamond_min"])
    max_yaw = config["landmarks"]["max_yaw_deg"]

    splits = _read_csv(paths.splits_csv)
    sources = _read_csv(paths.sources_csv)
    manifest_rej = _read_csv(paths.manifest_rejections_csv)
    dedup = _read_csv(paths.dedup_csv)
    identity = _read_csv(paths.identity_csv)
    rejections = _read_csv(paths.rejections_csv)

    table = _counts_table(splits, classes)
    totals = table.loc[classes, "total"]
    diamond = int(totals.get("DIAMOND", 0))
    nonzero = totals[totals > 0]
    imbalance = f"{nonzero.max() / nonzero.min():.2f}" if len(nonzero) else "n/a"
    missing_classes = [c for c in classes if totals[c] == 0]

    lines = [
        "# Face-shape dataset card",
        "",
        f"Generated {date.today().isoformat()} from `{paths.root}` by `make card`. "
        "Numbers come from the pipeline outputs; do not edit by hand.",
        "",
        "## Final dataset (after dedup, face filters and identity-aware split)",
        "",
        _md_table(table.reset_index().rename(columns={"label": "class"})),
        "",
        "![Class balance](class_balance.png)",
        "",
        f"- Imbalance ratio (largest / smallest non-empty class): **{imbalance}**.",
    ]
    if missing_classes:
        lines.append(f"- **Classes with no images:** {', '.join(missing_classes)}.")
    if diamond >= diamond_min:
        lines.append(f"- DIAMOND: {diamond} images (minimum {diamond_min}) - OK.")
    else:
        lines.append(f"- **DIAMOND: {diamond} images, below the {diamond_min} minimum (shortfall {diamond_min - diamond}).**")
    persons_per_split = splits.groupby("split")["person_id"].nunique().reindex(_SPLITS, fill_value=0)
    lines += [
        f"- Persons per split: {', '.join(f'{s} {n}' for s, n in persons_per_split.items())}; "
        "0 persons appear in more than one split (checked by `split.py`).",
        "",
        "## Manifest",
        "",
    ]
    if sources is not None:
        lines.append(f"- {len(sources)} images in `interim/sources.csv`.")
    if manifest_rej is not None:
        counts = manifest_rej["reason"].value_counts()
        lines.append("- Removed while building the manifest: " + (", ".join(f"{r} {n}" for r, n in counts.items()) or "none") + ".")
    else:
        lines.append("- Manifest removals: n/a.")

    lines += ["", "## Deduplication (dHash + pHash)", ""]
    if dedup is not None:
        status = dedup["status"].value_counts()
        groups = dedup.groupby("group").size()
        lines += [
            f"- Near-duplicate threshold: Hamming <= {config['dedup']['max_hamming']} on both hashes (horizontal mirrors count as duplicates).",
            f"- Duplicate groups: {(groups > 1).sum()}; removed duplicates: {int(status.get('duplicate', 0))}; "
            f"removed cross-label duplicates: {int(status.get('cross_label_duplicate', 0))}; kept: {int(status.get('kept', 0))}.",
        ]
    else:
        lines.append("- n/a.")

    lines += ["", "## Pseudo-identities", ""]
    if identity is not None:
        per_person = identity.groupby("person_id").size()
        no_emb = int((identity["has_embedding"] == "False").sum())
        backend = config["identity"]["backend"]
        lines.append(f"- Backend `{backend}`; {_threshold_summary(paths.identity_calibration_json)}")
        lines += [
            f"- {len(per_person)} persons for {len(identity)} images; images/person mean {per_person.mean():.2f}, "
            f"median {per_person.median():.0f}, max {per_person.max()}; {int((per_person == 1).sum())} singletons; "
            f"{no_emb} images without a face embedding (own singleton id).",
        ]
    else:
        lines.append("- n/a.")

    lines += ["", "## Face filter rejections (MediaPipe)", ""]
    if rejections is not None:
        counts = rejections["reason"].value_counts()
        lines.append(f"- |yaw| limit {max_yaw} deg; min cheekbone width {config['landmarks']['min_cheek_px']} px.")
        lines.append("- Rejected: " + (", ".join(f"{r} {n}" for r, n in counts.items()) or "none") + ".")
    else:
        lines.append("- n/a.")

    lines += ["", *_sources_section(sources, config), ""]
    lines += [
        "## Limitations",
        "",
        "- Gender bias: niten19 contains only female celebrities; the DIAMOND images from Roboflow/Kaggle extras may include men (Q2).",
        "- Label noise: niten19 labels come from web sources (\"celebrity X has a Y face\"); expect Oval/Oblong "
        "and Round/Oval confusions.",
        "- Person ids are pseudo-identities from face-embedding clustering, not ground truth.",
        "- InsightFace `buffalo_l` weights are licensed for non-commercial research only.",
        "- Landmark 10 is the top of the face mesh, not the hairline, so `lw_ratio` underestimates face "
        "length (`lw_ratio_ext` extrapolates it).",
        "",
    ]

    args.out_dir.mkdir(parents=True, exist_ok=True)
    _plot_balance(table, classes, args.out_dir / "class_balance.png")
    card = args.out_dir / "dataset_card.md"
    card.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {card} and {args.out_dir / 'class_balance.png'}.")


if __name__ == "__main__":
    main()
