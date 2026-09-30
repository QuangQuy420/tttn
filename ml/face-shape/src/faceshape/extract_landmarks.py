"""Step `make landmarks`: MediaPipe FaceLandmarker on every kept image -> `interim/landmarks.npz`.

FaceLandmarker (IMAGE mode, `num_faces=2`, facial transformation matrices on) with the
`.cache/face_landmarker.task` model from `make model` (same file as face-processing-service).
Rejections (with reason) go to `interim/rejections.csv`:

- `decode_error`  image cannot be read
- `no_face`       no face detected
- `multi_face`    more than one face
- `small_face`    cheekbone width (234 <-> 454, px) < `landmarks.min_cheek_px`
- `yaw_exceeded`  |yaw| > `landmarks.max_yaw_deg` (yaw from `head_pose_from_matrix`)
- `bad_pose`      `head_pose_from_matrix` rejected a degenerate/non-finite matrix (detail = error)

The npz holds, per kept image: `image_id`, `landmarks` (478x3, normalized as returned by
MediaPipe), `width`, `height`, `matrix` (4x4) and `yaw`/`pitch`/`roll` (degrees).
"""
import csv
from pathlib import Path
from typing import Any

import numpy as np

from app.ml.face_features import LandmarkIdx, head_pose_from_matrix, to_pixels
from faceshape.common import KEPT, build_parser, parse, require_file


def _create_landmarker(model_path: Path, min_confidence: float) -> Any:
    import mediapipe as mp

    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=2,
        min_face_detection_confidence=min_confidence,
        output_facial_transformation_matrixes=True,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def _load_rgb(path: str) -> np.ndarray | None:
    from PIL import Image, ImageFile

    ImageFile.LOAD_TRUNCATED_IMAGES = True
    try:
        with Image.open(path) as img:
            return np.ascontiguousarray(np.asarray(img.convert("RGB")))
    except Exception:
        return None


def main() -> None:
    parser = build_parser("Extract MediaPipe landmarks + head pose and reject unusable faces.")
    _, config, paths = parse(parser)
    import mediapipe as mp
    import pandas as pd
    from tqdm import tqdm

    require_file(paths.dedup_csv, "Run `make dedup` first.")
    model_path = Path(config["paths"]["model"])
    require_file(model_path, "Run `make model` to download face_landmarker.task.")
    cfg = config["landmarks"]
    min_cheek_px = float(cfg["min_cheek_px"])
    max_yaw = float(cfg["max_yaw_deg"])

    df = pd.read_csv(paths.dedup_csv, dtype=str)
    df = df[df["status"] == KEPT]
    landmarker = _create_landmarker(model_path, float(cfg["min_detection_confidence"]))

    kept: dict[str, list] = {k: [] for k in ("image_id", "landmarks", "width", "height", "matrix", "yaw", "pitch", "roll")}
    rejections: list[dict[str, str]] = []
    for row in tqdm(df.itertuples(index=False), total=len(df), desc="landmarks"):

        def reject(reason: str, detail: str = "") -> None:
            rejections.append(
                {"image_id": row.image_id, "path": row.path, "label": row.label, "reason": reason, "detail": detail}
            )

        rgb = _load_rgb(row.path)
        if rgb is None:
            reject("decode_error")
            continue
        result = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        num_faces = len(result.face_landmarks or [])
        if num_faces == 0:
            reject("no_face")
            continue
        if num_faces > 1:
            reject("multi_face", str(num_faces))
            continue

        height, width = rgb.shape[:2]
        landmarks = np.array([[p.x, p.y, p.z] for p in result.face_landmarks[0]], dtype=np.float32)
        px = to_pixels(landmarks, width, height)
        cheek_px = float(np.linalg.norm(px[LandmarkIdx.CHEEKBONE_R] - px[LandmarkIdx.CHEEKBONE_L]))
        if cheek_px < min_cheek_px:
            reject("small_face", f"{cheek_px:.1f}")
            continue
        matrix = np.asarray(result.facial_transformation_matrixes[0], dtype=np.float64)
        try:
            yaw, pitch, roll = head_pose_from_matrix(matrix)
        except ValueError as exc:
            reject("bad_pose", str(exc))
            continue
        if abs(yaw) > max_yaw:
            reject("yaw_exceeded", f"{yaw:.1f}")
            continue

        for key, value in (
            ("image_id", row.image_id), ("landmarks", landmarks), ("width", width), ("height", height),
            ("matrix", matrix), ("yaw", yaw), ("pitch", pitch), ("roll", roll),
        ):
            kept[key].append(value)
    # Close explicitly: leaving it to __del__ at interpreter exit prints a harmless TypeError.
    landmarker.close()

    paths.interim.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        paths.landmarks_npz,
        image_id=np.array(kept["image_id"], dtype=str),
        landmarks=np.array(kept["landmarks"], dtype=np.float32).reshape(-1, 478, 3),
        width=np.array(kept["width"], dtype=np.int32),
        height=np.array(kept["height"], dtype=np.int32),
        matrix=np.array(kept["matrix"], dtype=np.float64).reshape(-1, 4, 4),
        yaw=np.array(kept["yaw"]),
        pitch=np.array(kept["pitch"]),
        roll=np.array(kept["roll"]),
        max_yaw_deg=np.array(max_yaw),
    )
    with paths.rejections_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["image_id", "path", "label", "reason", "detail"])
        writer.writeheader()
        writer.writerows(rejections)

    reasons = pd.Series([r["reason"] for r in rejections], dtype=str).value_counts().to_dict()
    print(f"Kept {len(kept['image_id'])}/{len(df)} images -> {paths.landmarks_npz}; rejected: {reasons}")
    yaw_share = reasons.get("yaw_exceeded", 0) / max(len(df), 1)
    if yaw_share > float(cfg["yaw_warn_fraction"]):
        print(
            f"WARNING: {yaw_share:.1%} of images exceed |yaw| > {max_yaw} deg (Q3). Consider "
            "landmarks.max_yaw_deg: 25 in config.yaml and note the change in the dataset card."
        )


if __name__ == "__main__":
    main()
