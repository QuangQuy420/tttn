"""Step used by `make sample`: seeded, class-stratified subset of the full manifest.

Reads `<source-dir>/interim/sources.csv` (the full manifest, default `data/`) and writes
`sample.sample_size` rows to `<data-dir>/interim/sources.csv` (`make sample` uses
`--data-dir data/sample`). The later steps then run with the same `--data-dir`, so the full
outputs under `data/` are never overwritten. Image paths still point at `data/raw/`.
"""
from pathlib import Path

from faceshape.common import DataPaths, build_parser, parse, require_file


def main() -> None:
    parser = build_parser("Write a stratified sample of the full manifest into <data-dir>/interim/sources.csv.")
    parser.add_argument("--source-dir", type=Path, default=Path("data"), help="data root of the full manifest")
    args, config, paths = parse(parser)
    import pandas as pd

    source = DataPaths(args.source_dir)
    require_file(source.sources_csv, "Run `make manifest` first.")
    if source.root.resolve() == paths.root.resolve():
        raise SystemExit("ERROR: --data-dir must differ from --source-dir (the sample would overwrite the manifest).")
    size = int(config["sample"]["sample_size"])
    seed = int(config["sample"]["seed"])

    df = pd.read_csv(source.sources_csv, dtype=str)
    if len(df) <= size:
        sample = df
    else:
        per_class = (df["label"].value_counts(normalize=True) * size).round().astype(int).clip(lower=1)
        parts = [
            group.sample(n=min(len(group), int(per_class[label])), random_state=seed)
            for label, group in df.groupby("label")
        ]
        sample = pd.concat(parts).sort_values("image_id")

    paths.interim.mkdir(parents=True, exist_ok=True)
    sample.to_csv(paths.sources_csv, index=False)
    print(f"Wrote {len(sample)} rows to {paths.sources_csv}: {sample['label'].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
