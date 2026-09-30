"""Step `make identity`: pseudo person ids from face embeddings -> `interim/identity.csv`.

Embeds the largest face of every kept (deduplicated) image with InsightFace `buffalo_l` (ArcFace,
512-d) or, as the Q1 fallback, `face_recognition` (dlib, 128-d); embeddings are L2-normalized and
clustered with agglomerative clustering (cosine distance, average linkage,
`identity.distance_threshold[backend]`). Images without a detectable face get their own singleton
person id so the identity-aware split still covers them (they are usually rejected later by
`extract_landmarks.py` anyway).

The threshold is calibrated on a null distribution: cosine distances of random image pairs (mostly
different people). The suggested threshold is its `identity.calibration_percentile`-th percentile;
set `distance_threshold.<backend>: auto` to use it instead of the fixed value. Used + suggested
thresholds and the null statistics are written to `interim/identity_calibration.json`.

Note: the `buffalo_l` weights are licensed for non-commercial research only.
"""
import json
from typing import Callable

import numpy as np

from faceshape.common import KEPT, build_parser, parse, require_file


def _insightface_embedder(det_size: int) -> Callable[[np.ndarray], np.ndarray | None]:
    from insightface.app import FaceAnalysis

    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=(det_size, det_size))

    def embed(rgb: np.ndarray) -> np.ndarray | None:
        faces = app.get(np.ascontiguousarray(rgb[:, :, ::-1]))  # insightface expects BGR
        if not faces:
            return None
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return face.normed_embedding

    return embed


def _face_recognition_embedder() -> Callable[[np.ndarray], np.ndarray | None]:
    import face_recognition

    def embed(rgb: np.ndarray) -> np.ndarray | None:
        boxes = face_recognition.face_locations(rgb)
        if not boxes:
            return None
        box = max(boxes, key=lambda b: (b[2] - b[0]) * (b[1] - b[3]))
        return face_recognition.face_encodings(rgb, known_face_locations=[box])[0]

    return embed


def _embed_all(paths: list[str], backend: str, det_size: int) -> list[np.ndarray | None]:
    from PIL import Image, ImageFile
    from tqdm import tqdm

    ImageFile.LOAD_TRUNCATED_IMAGES = True
    if backend == "insightface":
        embed = _insightface_embedder(det_size)
    elif backend == "face_recognition":
        embed = _face_recognition_embedder()
    else:
        raise SystemExit(f"ERROR: unknown identity.backend {backend!r} (insightface | face_recognition).")

    embeddings: list[np.ndarray | None] = []
    for path in tqdm(paths, desc=f"embedding ({backend})"):
        with Image.open(path) as img:
            rgb = np.asarray(img.convert("RGB"))
        vec = embed(rgb)
        embeddings.append(None if vec is None else np.asarray(vec, dtype=np.float64) / np.linalg.norm(vec))
    return embeddings


def calibrate(vectors: np.ndarray, n_pairs: int, seed: int, percentile: float) -> tuple[dict[str, float], np.ndarray]:
    """Null distribution of cosine distances between random image pairs (mostly different people).

    The suggested threshold is its `percentile`-th percentile: only that share of random pairs
    would be merged by the clustering. Returns `(stats, null distances)`.
    """
    rng = np.random.default_rng(seed)
    a = rng.integers(0, len(vectors), n_pairs)
    b = rng.integers(0, len(vectors), n_pairs)
    mask = a != b
    dist = 1.0 - np.sum(vectors[a[mask]] * vectors[b[mask]], axis=1)
    p1, p5, p50 = np.percentile(dist, [1, 5, 50])
    stats = {
        "null_pairs": int(mask.sum()),
        "null_p1": float(p1),
        "null_p5": float(p5),
        "null_median": float(p50),
        "calibration_percentile": percentile,
        "suggested_threshold": float(np.percentile(dist, percentile)),
    }
    return stats, dist


def cluster(vectors: np.ndarray, threshold: float) -> np.ndarray:
    from sklearn.cluster import AgglomerativeClustering

    if len(vectors) < 2:
        return np.zeros(len(vectors), dtype=int)
    model = AgglomerativeClustering(
        n_clusters=None, metric="cosine", linkage="average", distance_threshold=threshold
    )
    return model.fit_predict(vectors)


def main() -> None:
    parser = build_parser("Assign pseudo person ids (face embeddings + clustering) -> interim/identity.csv.")
    _, config, paths = parse(parser)
    import pandas as pd

    require_file(paths.dedup_csv, "Run `make dedup` first.")
    cfg = config["identity"]
    backend = cfg["backend"]
    configured = cfg["distance_threshold"][backend]

    df = pd.read_csv(paths.dedup_csv, dtype=str)
    df = df[df["status"] == KEPT].reset_index(drop=True)
    embeddings = _embed_all(df["path"].tolist(), backend, int(cfg["det_size"]))
    has_embedding = np.array([e is not None for e in embeddings])
    vectors = np.array([e for e in embeddings if e is not None])

    stats: dict[str, object] = {"backend": backend, "configured_threshold": configured}
    null_dist = None
    if len(vectors) > 1:
        null_stats, null_dist = calibrate(
            vectors, int(cfg["null_pairs"]), int(config["split"]["seed"]), float(cfg["calibration_percentile"])
        )
        stats.update(null_stats)
    if configured == "auto":
        if "suggested_threshold" not in stats:
            raise SystemExit("ERROR: distance_threshold is auto but fewer than 2 faces were embedded - cannot calibrate.")
        threshold = float(stats["suggested_threshold"])
    else:
        threshold = float(configured)
    stats["threshold_used"] = threshold

    if null_dist is not None:
        stats["null_share_below_used"] = float((null_dist <= threshold).mean())
        print(
            f"Null distribution ({stats['null_pairs']} random pairs): cosine distance p1={stats['null_p1']:.3f} "
            f"p5={stats['null_p5']:.3f} median={stats['null_median']:.3f}; suggested threshold "
            f"(p{stats['calibration_percentile']:g}) = {stats['suggested_threshold']:.3f}; using {threshold:.3f} "
            f"({stats['null_share_below_used']:.2%} of random pairs are <= it)."
        )
        if threshold > stats["suggested_threshold"]:
            print("WARNING: threshold is above the suggested (calibrated) threshold - it may merge different people.")

    person_ids = [f"solo_{image_id}" for image_id in df["image_id"]]
    if len(vectors):
        labels = cluster(vectors, threshold)
        for row, label in zip(np.nonzero(has_embedding)[0], labels):
            person_ids[row] = f"p{int(label):05d}"

    paths.identity_calibration_json.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    out = pd.DataFrame({"image_id": df["image_id"], "person_id": person_ids, "has_embedding": has_embedding})
    out.to_csv(paths.identity_csv, index=False)
    sizes = out["person_id"].value_counts()
    print(
        f"Wrote {paths.identity_csv}: {len(out)} images, {len(sizes)} persons "
        f"({(~has_embedding).sum()} without a face embedding), max {sizes.max()} images/person."
    )


if __name__ == "__main__":
    main()
