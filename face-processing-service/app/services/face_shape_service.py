"""Landmark extraction + rule-based face-shape classification.

Uses MediaPipe's Task API (`mediapipe.tasks.vision.FaceLandmarker`) — the newer
`mediapipe.solutions.face_mesh` legacy API this plan originally assumed is bundled in
the pip package has been **removed** as of the `mediapipe` version resolved fresh by
this Dockerfile (verified: `mediapipe==0.10.35` only exposes `mp.tasks`, `mp.Image`,
`mp.ImageFormat` — `mp.solutions` no longer exists). `FaceLandmarker` needs a `.task`
model file, which is downloaded at Docker build time (see `Dockerfile`) into
`MODEL_PATH` below rather than at request time, so there is no runtime network
dependency and no missing-file surprise on first request. It returns the same 468/478
-point landmark topology as the old Face Mesh solution, so the landmark indices below
are unchanged.

The landmarker also needs `libEGL`/`libGLESv2` at the OS level (beyond the `libgl1`/
`libglib2.0-0` already in the Dockerfile for OpenCV) — verified by directly running
the built image; see `Dockerfile` for the added `libgles2 libegl1` packages.
"""
import os
import threading

import cv2
import mediapipe as mp
import numpy as np

from app.db.models import FaceShape
from app.schemas.face import FaceMeasurements

# --- MediaPipe Face Landmarker model asset ---
# Downloaded at Docker build time (see Dockerfile) from Google's model repository.
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "models", "face_landmarker.task")

# --- MediaPipe Face Landmarker landmark indices used for measurements ---
# Indices refer to the standard 468/478-point MediaPipe face mesh topology.
_FOREHEAD_LEFT = 103  # left temple/forehead edge
_FOREHEAD_RIGHT = 332  # right temple/forehead edge
_CHEEKBONE_LEFT = 234  # left cheekbone (widest point, left ear-adjacent zygomatic area)
_CHEEKBONE_RIGHT = 454  # right cheekbone (mirror of 234)
_JAW_LEFT = 172  # left jaw (gonion-adjacent)
_JAW_RIGHT = 397  # right jaw (mirror of 172)
_CHIN = 152  # chin tip (bottom of face)
_FOREHEAD_TOP = 10  # top of forehead / hairline-adjacent point (top of MediaPipe's face oval)

_MAX_NUM_FACES = 2  # detect up to 2 so we can distinguish "0" vs "1" vs ">1" faces


class FaceAnalysisError(Exception):
    """Base class for domain errors raised by this service."""


class NoFaceDetectedError(FaceAnalysisError):
    pass


class MultipleFacesDetectedError(FaceAnalysisError):
    pass


class InvalidImageError(FaceAnalysisError):
    pass


_landmarker_lock = threading.Lock()
_landmarker: mp.tasks.vision.FaceLandmarker | None = None


def _get_landmarker() -> "mp.tasks.vision.FaceLandmarker":
    """Lazily create a single, process-wide `FaceLandmarker` (loading the model file
    per request would be wasteful — it's a few MB parsed on every call)."""
    global _landmarker
    if _landmarker is None:
        with _landmarker_lock:
            if _landmarker is None:
                base_options = mp.tasks.BaseOptions(model_asset_path=MODEL_PATH)
                options = mp.tasks.vision.FaceLandmarkerOptions(
                    base_options=base_options,
                    running_mode=mp.tasks.vision.RunningMode.IMAGE,
                    num_faces=_MAX_NUM_FACES,
                    min_face_detection_confidence=0.5,
                )
                _landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
    return _landmarker


def _decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode raw image bytes into a BGR `numpy` array (OpenCV convention)."""
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise InvalidImageError("Could not decode image — file may be corrupt or not a real image.")
    return image


def _distance(a, b) -> float:
    return float(np.hypot(a.x - b.x, a.y - b.y))


def _extract_measurements(landmarks) -> FaceMeasurements:
    """Compute face-shape measurements from one face's landmark list.

    All distances are in MediaPipe's normalized landmark space (fraction of image
    width/height) — there is no physical (mm) scale available from a single 2D photo,
    so only *ratios* between these measurements are meaningful, not absolute values.
    """
    face_length = _distance(landmarks[_FOREHEAD_TOP], landmarks[_CHIN])
    forehead_width = _distance(landmarks[_FOREHEAD_LEFT], landmarks[_FOREHEAD_RIGHT])
    cheekbone_width = _distance(landmarks[_CHEEKBONE_LEFT], landmarks[_CHEEKBONE_RIGHT])
    jaw_width = _distance(landmarks[_JAW_LEFT], landmarks[_JAW_RIGHT])

    return FaceMeasurements(
        face_length=face_length,
        forehead_width=forehead_width,
        cheekbone_width=cheekbone_width,
        jaw_width=jaw_width,
        length_to_width_ratio=face_length / cheekbone_width,
        cheekbone_to_jaw_ratio=jaw_width / cheekbone_width,
        forehead_to_jaw_ratio=forehead_width / jaw_width,
    )


def classify_face_shape(measurements: FaceMeasurements) -> tuple[FaceShape, float]:
    """Rule-based classification into the 6 `FaceShape` values, with a confidence score.

    Thresholds below are literature-based approximations commonly cited in face-shape
    analysis guides (e.g. face-length/width and jaw/cheekbone/forehead ratio bands used
    by consumer face-shape quizzes and dermatology/styling references). They are a
    documented judgment call (plan Q1), not a trained/validated model — reasonable
    starting cutoffs for a thesis report:

    - `length_to_width_ratio` (face_length / cheekbone_width):
        > 1.15  -> face is notably longer than wide  -> OBLONG candidate
        <= 0.95 -> face is about as wide as (or wider than) long -> ROUND/SQUARE candidate
        otherwise -> "balanced" length -> OVAL/HEART/DIAMOND candidate
    - `cheekbone_to_jaw_ratio` (jaw_width / cheekbone_width):
        >= 0.95 -> jaw is nearly as wide as cheekbones -> boxier (SQUARE/ROUND) jaw
        <  0.80 -> jaw notably narrower than cheekbones -> tapered (HEART/DIAMOND) jaw
    - `forehead_to_jaw_ratio` (forehead_width / jaw_width):
        >= 1.10 -> forehead notably wider than jaw -> HEART candidate
        <= 0.90 -> jaw notably wider than forehead -> triangle-ish, folded into SQUARE/ROUND below
        otherwise -> forehead/jaw comparable

    Decision order (most distinctive ratio first):
    1. OBLONG: long face (length_to_width_ratio > 1.15) with a boxy jaw
       (cheekbone_to_jaw_ratio >= 0.85) — long AND fairly uniform width top-to-bottom.
    2. HEART: wide forehead relative to jaw (forehead_to_jaw_ratio >= 1.10) with a
       tapered jaw (cheekbone_to_jaw_ratio < 0.85).
    3. DIAMOND: narrow forehead AND narrow jaw relative to cheekbones
       (forehead_to_jaw_ratio < 0.90 and cheekbone_to_jaw_ratio < 0.80) — cheekbones are
       the widest point, both forehead and jaw taper in.
    4. SQUARE: boxy jaw (cheekbone_to_jaw_ratio >= 0.90) and a face that is not much
       longer than wide (length_to_width_ratio <= 1.05) — strong, angular jawline.
    5. ROUND: short/balanced face (length_to_width_ratio <= 0.95) that isn't boxy
       enough to be SQUARE.
    6. OVAL: default/fallback — balanced ratios that don't clearly match the above
       (the "no strong distinguishing feature" case, consistent with OVAL being the
       most common baseline shape in face-shape literature).

    Confidence is a heuristic 0-1 score: how far the deciding ratio sits from the
    nearest threshold, scaled and clamped — a modest distance from a boundary yields
    a modest confidence rather than a hard 0/1, since this is a rule-based estimate,
    not a calibrated classifier probability.
    """
    lw = measurements.length_to_width_ratio
    cj = measurements.cheekbone_to_jaw_ratio
    fj = measurements.forehead_to_jaw_ratio

    if lw > 1.15 and cj >= 0.85:
        shape = FaceShape.OBLONG
        margin = min(lw - 1.15, cj - 0.85)
    elif fj >= 1.10 and cj < 0.85:
        shape = FaceShape.HEART
        margin = min(fj - 1.10, 0.85 - cj)
    elif fj < 0.90 and cj < 0.80:
        shape = FaceShape.DIAMOND
        margin = min(0.90 - fj, 0.80 - cj)
    elif cj >= 0.90 and lw <= 1.05:
        shape = FaceShape.SQUARE
        margin = min(cj - 0.90, 1.05 - lw)
    elif lw <= 0.95:
        shape = FaceShape.ROUND
        margin = 0.95 - lw
    else:
        shape = FaceShape.OVAL
        # OVAL is the fallback bucket — confidence reflects how central the ratios
        # are within the "balanced" band (0.95, 1.15) rather than a specific margin.
        margin = min(lw - 0.95, 1.15 - lw)

    # Scale the winning margin into [0.5, 0.99]: a bare pass of a threshold still
    # yields a moderate confidence (0.5), a wide margin approaches high confidence.
    confidence = 0.5 + min(max(margin, 0.0) * 2.5, 0.49)
    return shape, round(confidence, 2)


def analyze_face(image_bytes: bytes) -> tuple[FaceMeasurements, FaceShape, float]:
    """Full pipeline: decode image -> detect landmarks -> measure -> classify.

    Raises `NoFaceDetectedError` / `MultipleFacesDetectedError` / `InvalidImageError`
    for the respective domain error cases (per coder.md §3 — no generic 500s).
    """
    image = _decode_image(image_bytes)
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)

    result = _get_landmarker().detect(mp_image)

    num_faces = len(result.face_landmarks) if result.face_landmarks else 0
    if num_faces == 0:
        raise NoFaceDetectedError("No face detected in the uploaded image.")
    if num_faces > 1:
        raise MultipleFacesDetectedError(
            "Multiple faces detected — please upload a photo with exactly one face."
        )

    landmarks = result.face_landmarks[0]
    measurements = _extract_measurements(landmarks)
    face_shape, confidence = classify_face_shape(measurements)
    return measurements, face_shape, confidence
