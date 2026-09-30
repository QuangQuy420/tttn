"""Step `make dedup`: remove exact and near-duplicate images -> `interim/dedup.csv`.

dHash + pHash (`imagehash`); two images are near-duplicates when both Hamming distances are
<= `dedup.max_hamming`; each distance is the minimum over the other image and its horizontal
mirror, so flipped copies (Roboflow augmentations) are caught too. Duplicates are grouped
transitively (union-find). A group whose images all share one label keeps its highest-resolution
image; a group spanning several labels is dropped entirely (`cross_label_duplicate`) because we
cannot tell which label is right.

`status` per manifest row: `kept`, `duplicate` (of `kept_image_id`) or `cross_label_duplicate`.
"""
import numpy as np

from faceshape.common import KEPT, build_parser, parse, require_file


def _hash_bits(paths: list[str], hash_size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, list[int]]:
    """Return `(dhash, dhash of mirror, phash, phash of mirror)` bit arrays (N, B) + pixel areas."""
    import imagehash
    from PIL import Image, ImageFile, ImageOps
    from tqdm import tqdm

    ImageFile.LOAD_TRUNCATED_IMAGES = True
    dbits, dbits_m, pbits, pbits_m, areas = [], [], [], [], []
    for path in tqdm(paths, desc="hashing"):
        with Image.open(path) as img:
            img = img.convert("RGB")
            mirror = ImageOps.mirror(img)
            dbits.append(imagehash.dhash(img, hash_size=hash_size).hash.flatten())
            dbits_m.append(imagehash.dhash(mirror, hash_size=hash_size).hash.flatten())
            pbits.append(imagehash.phash(img, hash_size=hash_size).hash.flatten())
            pbits_m.append(imagehash.phash(mirror, hash_size=hash_size).hash.flatten())
            areas.append(img.width * img.height)
    arrays = (np.array(bits, dtype=bool) for bits in (dbits, dbits_m, pbits, pbits_m))
    return (*arrays, areas)


def _find(parent: list[int], i: int) -> int:
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def _mirror_aware_distance(bits: np.ndarray, bits_m: np.ndarray, i: int) -> np.ndarray:
    """Hamming distance of row i to every later row: min(dist(a, b), dist(a, mirror(b)))."""
    direct = (bits[i + 1 :] != bits[i]).sum(axis=1)
    mirrored = (bits_m[i + 1 :] != bits[i]).sum(axis=1)
    return np.minimum(direct, mirrored)


def group_duplicates(
    dbits: np.ndarray, dbits_m: np.ndarray, pbits: np.ndarray, pbits_m: np.ndarray, max_hamming: int
) -> list[int]:
    """Union-find over all pairs; returns the group root index for each row.

    Horizontally mirrored copies (e.g. Roboflow flip augmentations) count as duplicates: each hash
    distance is the minimum over the image and its mirror, and both must be <= `max_hamming`.
    """
    n = len(dbits)
    parent = list(range(n))
    for i in range(n - 1):
        d = _mirror_aware_distance(dbits, dbits_m, i)
        p = _mirror_aware_distance(pbits, pbits_m, i)
        for j in np.nonzero((d <= max_hamming) & (p <= max_hamming))[0]:
            a, b = _find(parent, i), _find(parent, i + 1 + int(j))
            if a != b:
                parent[b] = a
    return [_find(parent, i) for i in range(n)]


def main() -> None:
    parser = build_parser("Detect exact/near-duplicate images (dHash + pHash) -> interim/dedup.csv.")
    _, config, paths = parse(parser)
    import pandas as pd

    require_file(paths.sources_csv, "Run `make manifest` first.")
    cfg = config["dedup"]

    df = pd.read_csv(paths.sources_csv, dtype=str)
    dbits, dbits_m, pbits, pbits_m, areas = _hash_bits(df["path"].tolist(), cfg["hash_size"])
    df["area"] = areas
    df["dhash"] = ["".join("1" if b else "0" for b in row) for row in dbits]
    df["phash"] = ["".join("1" if b else "0" for b in row) for row in pbits]
    df["group"] = group_duplicates(dbits, dbits_m, pbits, pbits_m, cfg["max_hamming"])

    df["status"] = KEPT
    df["kept_image_id"] = df["image_id"]
    for _, group in df.groupby("group"):
        if len(group) == 1:
            continue
        if group["label"].nunique() > 1:
            df.loc[group.index, "status"] = "cross_label_duplicate"
            df.loc[group.index, "kept_image_id"] = ""
            continue
        keeper = group.sort_values(["area", "path"], ascending=[False, True]).index[0]
        others = group.index.drop(keeper)
        df.loc[others, "status"] = "duplicate"
        df.loc[others, "kept_image_id"] = df.at[keeper, "image_id"]

    columns = ["image_id", "path", "source", "label", "area", "dhash", "phash", "group", "status", "kept_image_id"]
    df[columns].to_csv(paths.dedup_csv, index=False)
    counts = df["status"].value_counts().to_dict()
    print(f"Wrote {paths.dedup_csv}: {counts}")


if __name__ == "__main__":
    main()
