"""Landmark normalization + geometric face-shape features (pure numpy).

Shared by the offline dataset pipeline (`ml/face-shape`, plan 06/07) and — from plan 08 —
the `/analyze` endpoint, so training and serving compute features with the **same** code
(train/serve parity). Any change to the landmark set, `normalize` or `compute_features`
must bump `FEATURE_SCHEMA_VERSION` and re-run the dataset/training pipeline.

Intended call chain for one MediaPipe `FaceLandmarker` face (478 landmarks):

    points = normalize(to_pixels(landmarks_xy, width, height))
    features = compute_features(points)

This module deliberately imports only numpy/stdlib (no cv2/mediapipe/FastAPI) so it can be
unit-tested on synthetic arrays and imported by the `ml/` scripts without the web stack.

Coordinate convention: image coordinates (x to the right, y **down**), so after `normalize`
the forehead has negative y and the chin positive y.
"""
import math

import numpy as np

FEATURE_SCHEMA_VERSION = "1"

# Forehead extrapolation factor for `lw_ratio_ext`: landmark 10 is the top of the mesh, not
# the hairline, so the "true" top is estimated as 10 + HAIRLINE_K * (10 - 9).
HAIRLINE_K = 0.5

# MediaPipe FaceLandmarker returns 468 face-mesh points + 10 iris points (468-477).
NUM_LANDMARKS = 478


class LandmarkIdx:
    """MediaPipe 478-point face-mesh indices used by the features.

    "L"/"R" are the subject's left/right (subject-left appears on the image's right side).
    Sources: https://www.sanderdesnaijer.com/blog/mediapipe-face-mesh-landmarks,
    https://github.com/MartinSaraka/face-metrics.
    """

    TOP = 10  # top of the face oval (mesh top, below the hairline)
    GLABELLA = 9  # between the eyebrows
    FOREHEAD_MID = 151  # mid forehead, between 10 and 9
    CHIN = 152  # chin tip (bottom of the face oval)
    FOREHEAD_R = 103
    FOREHEAD_L = 332
    FOREHEAD_UPPER_R = 54
    FOREHEAD_UPPER_L = 284
    TEMPLE_R = 21
    TEMPLE_L = 251
    CHEEKBONE_R = 234  # widest point (zygomatic, ear-adjacent)
    CHEEKBONE_L = 454
    CHEEK_UPPER_R = 127
    CHEEK_UPPER_L = 356
    JAW_R = 172  # gonion-adjacent
    JAW_L = 397
    JAW2_R = 58
    JAW2_L = 288
    JAW_UPPER_R = 132
    JAW_UPPER_L = 361
    CHIN_WIDTH_R = 176
    CHIN_WIDTH_L = 400
    CHIN_LOWER_R = 148
    CHIN_LOWER_L = 377
    EYE_OUTER_R = 33
    EYE_OUTER_L = 263
    EYE_INNER_R = 133
    EYE_INNER_L = 362
    IRIS_R = 468  # iris center (only present in the 478-point output)
    IRIS_L = 473
    NOSE_BRIDGE = 168
    NOSE_BRIDGE_LOWER = 6
    NOSE_TIP = 1

    # Face-oval contour, clockwise in the image starting at the top (10), passing the
    # subject's left cheek (454), the chin (152) and the subject's right cheek (234).
    # FACE_OVAL[i] and FACE_OVAL[36 - i] (i = 1..17) are mirror pairs.
    FACE_OVAL = (
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
        379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
    )


# Positions inside FACE_OVAL used by the contour features.
_OVAL_CHIN_POS = LandmarkIdx.FACE_OVAL.index(LandmarkIdx.CHIN)  # 18
_OVAL_CHEEK_L_POS = LandmarkIdx.FACE_OVAL.index(LandmarkIdx.CHEEKBONE_L)  # 8
_OVAL_CHEEK_R_POS = LandmarkIdx.FACE_OVAL.index(LandmarkIdx.CHEEKBONE_R)  # 28

# Heights (fraction of the 10 -> 152 span, top -> bottom) sampled by `width_profile_slope`;
# the endpoints are skipped because the contour width collapses to ~0 there.
_WIDTH_PROFILE_LEVELS = np.linspace(1 / 6, 5 / 6, 5)

FEATURE_NAMES: tuple[str, ...] = (
    "lw_ratio",
    "lw_ratio_ext",
    "upper_face_ratio",
    "jaw_height_ratio",
    "forehead_cheek",
    "temple_cheek",
    "jaw_cheek",
    "jaw2_cheek",
    "chin_jaw",
    "forehead_jaw",
    "jaw_angle_l",
    "jaw_angle_r",
    "jaw_angle_mean",
    "chin_angle",
    "lower_face_ratio",
    "mid_face_ratio",
    "contour_curvature",
    "width_profile_slope",
    "ipd_cheek",
    "symmetry",
)


def _check_points(points: np.ndarray) -> np.ndarray:
    """Validate a `(478, 2)` landmark array and return it as float64."""
    points = np.asarray(points, dtype=np.float64)
    if points.ndim != 2 or points.shape[1] != 2 or points.shape[0] < NUM_LANDMARKS:
        raise ValueError(f"Expected a ({NUM_LANDMARKS}, 2) landmark array, got shape {points.shape}.")
    return points


def _dist(points: np.ndarray, a: int, b: int) -> float:
    return float(np.linalg.norm(points[a] - points[b]))


def _angle_at(points: np.ndarray, vertex: int, a: int, b: int) -> float:
    """Interior angle (degrees) at `vertex` between the rays vertex->a and vertex->b."""
    u = points[a] - points[vertex]
    v = points[b] - points[vertex]
    norms = float(np.linalg.norm(u) * np.linalg.norm(v))
    if norms < 1e-9:
        raise ValueError(f"Degenerate angle at landmark {vertex} — a ray has zero length.")
    cos = float(np.dot(u, v)) / norms
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def to_pixels(landmarks_xy: np.ndarray, width: int, height: int) -> np.ndarray:
    """Convert MediaPipe normalized landmarks (x / width, y / height) to pixel coordinates.

    Fixes the aspect-ratio bug of distances computed in normalized space (horizontal and
    vertical units differ whenever width != height). Accepts `(N, 2)` or `(N, 3)` arrays;
    a z column is dropped. Returns a new `(N, 2)` float64 array.
    """
    landmarks_xy = np.asarray(landmarks_xy, dtype=np.float64)
    if landmarks_xy.ndim != 2 or landmarks_xy.shape[1] not in (2, 3):
        raise ValueError(f"Expected an (N, 2) or (N, 3) landmark array, got shape {landmarks_xy.shape}.")
    if width <= 0 or height <= 0:
        raise ValueError(f"Image size must be positive, got {width}x{height}.")
    return landmarks_xy[:, :2] * np.array([width, height], dtype=np.float64)


def normalize(points: np.ndarray, align_roll: bool = True) -> np.ndarray:
    """Pose-normalize pixel landmarks (output of `to_pixels`).

    (a) if `align_roll`: rotate around the eye midpoint so the outer-eye line 33 -> 263 is
        horizontal (the plan-07 ablation turns this off);
    (b) translate so the cheekbone midpoint (234/454) is the origin;
    (c) scale so the cheekbone width (234 <-> 454) is 1.0.

    Returns a new `(478, 2)` array; the input is not modified.
    """
    points = _check_points(points).copy()

    if align_roll:
        eye_r = points[LandmarkIdx.EYE_OUTER_R]
        eye_l = points[LandmarkIdx.EYE_OUTER_L]
        center = (eye_r + eye_l) / 2
        dx, dy = eye_l - eye_r
        theta = -math.atan2(dy, dx)  # rotate by -roll so the eye line ends up horizontal
        rotation = np.array(
            [[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]], dtype=np.float64
        )
        points = (points - center) @ rotation.T + center

    origin = (points[LandmarkIdx.CHEEKBONE_R] + points[LandmarkIdx.CHEEKBONE_L]) / 2
    points -= origin

    cheek_width = _dist(points, LandmarkIdx.CHEEKBONE_R, LandmarkIdx.CHEEKBONE_L)
    if cheek_width < 1e-9:
        raise ValueError("Cheekbone width is zero — landmarks are degenerate.")
    return points / cheek_width


def _contour_curvature(points: np.ndarray) -> float:
    """Standard deviation of the absolute turning angles (degrees) along the lower face oval,
    cheek -> chin -> cheek (454 -> 152 -> 234).

    The mean would be useless here: on a convex contour every turn has the same sign, so the
    total turn is roughly constant. The spread is what differs — high = turning concentrated
    at the jaw corners (square jaw), low = even turning along the contour (round jaw).
    """
    lower = [LandmarkIdx.FACE_OVAL[i] for i in range(_OVAL_CHEEK_L_POS, _OVAL_CHEEK_R_POS + 1)]
    segments = np.diff(points[lower], axis=0)
    headings = np.arctan2(segments[:, 1], segments[:, 0])
    # Wrap heading changes into (-pi, pi] before taking the magnitude.
    turns = (np.diff(headings) + math.pi) % (2 * math.pi) - math.pi
    return float(np.degrees(np.abs(turns)).std())


def _width_profile_slope(points: np.ndarray) -> float:
    """Slope of a linear fit of the face-oval width sampled at 5 heights (top -> bottom).

    Heights are fractions of the 10 -> 152 vertical span; widths are in normalized
    (cheekbone = 1) units. Negative slope = face narrows toward the chin.
    """
    oval = LandmarkIdx.FACE_OVAL
    side_l = points[list(oval[: _OVAL_CHIN_POS + 1])]  # 10 -> 152 via the subject's left
    side_r = points[list(oval[_OVAL_CHIN_POS:]) + [oval[0]]]  # 152 -> 10 via the subject's right
    y_top = points[LandmarkIdx.TOP][1]
    y_bottom = points[LandmarkIdx.CHIN][1]
    levels = y_top + _WIDTH_PROFILE_LEVELS * (y_bottom - y_top)

    def x_at(side: np.ndarray) -> np.ndarray:
        order = np.argsort(side[:, 1])
        return np.interp(levels, side[order, 1], side[order, 0])

    widths = np.abs(x_at(side_l) - x_at(side_r))
    slope, _ = np.polyfit(_WIDTH_PROFILE_LEVELS, widths, 1)
    return float(slope)


def _symmetry(points: np.ndarray) -> float:
    """Mean distance between each face-oval point and its mirrored partner (x -> -x).

    The mirror axis is the vertical line through the cheekbone midpoint, which is the
    origin after `normalize`. 0 = perfectly symmetric.
    """
    oval = LandmarkIdx.FACE_OVAL
    n = len(oval)
    left = points[[oval[i] for i in range(1, n // 2)]]
    right = points[[oval[n - i] for i in range(1, n // 2)]]
    mirrored_right = right * np.array([-1.0, 1.0])
    return float(np.linalg.norm(left - mirrored_right, axis=1).mean())


def compute_features(points: np.ndarray) -> dict[str, float]:
    """Compute the 20 geometric face-shape features, keyed and ordered as `FEATURE_NAMES`.

    `points` MUST be the output of `normalize(to_pixels(...))` — this function does not
    normalize internally (so the `align_roll` ablation stays a caller choice). Length/width
    features are still divided explicitly by the cheekbone width, so the ratio features do
    not depend on the scale step. "Vertical" means the y axis of the (roll-aligned) frame.
    Angles are in degrees.
    """
    p = _check_points(points)
    idx = LandmarkIdx

    cheek = _dist(p, idx.CHEEKBONE_R, idx.CHEEKBONE_L)
    face_length = _dist(p, idx.TOP, idx.CHIN)
    forehead = _dist(p, idx.FOREHEAD_R, idx.FOREHEAD_L)
    jaw = _dist(p, idx.JAW_R, idx.JAW_L)
    if face_length < 1e-9 or jaw < 1e-9:
        raise ValueError("Face length or jaw width is zero — landmarks are degenerate.")

    top_ext = p[idx.TOP] + HAIRLINE_K * (p[idx.TOP] - p[idx.GLABELLA])
    jaw_mid_y = (p[idx.JAW_R][1] + p[idx.JAW_L][1]) / 2
    jaw_angle_l = _angle_at(p, idx.JAW_L, idx.CHEEKBONE_L, idx.CHIN)
    jaw_angle_r = _angle_at(p, idx.JAW_R, idx.CHEEKBONE_R, idx.CHIN)

    values = {
        "lw_ratio": face_length / cheek,
        "lw_ratio_ext": float(np.linalg.norm(top_ext - p[idx.CHIN])) / cheek,
        "upper_face_ratio": _dist(p, idx.TOP, idx.GLABELLA) / face_length,
        "jaw_height_ratio": abs(p[idx.CHIN][1] - jaw_mid_y) / face_length,
        "forehead_cheek": forehead / cheek,
        "temple_cheek": _dist(p, idx.TEMPLE_R, idx.TEMPLE_L) / cheek,
        "jaw_cheek": jaw / cheek,
        "jaw2_cheek": _dist(p, idx.JAW2_R, idx.JAW2_L) / cheek,
        "chin_jaw": _dist(p, idx.CHIN_WIDTH_R, idx.CHIN_WIDTH_L) / jaw,
        "forehead_jaw": forehead / jaw,
        "jaw_angle_l": jaw_angle_l,
        "jaw_angle_r": jaw_angle_r,
        "jaw_angle_mean": (jaw_angle_l + jaw_angle_r) / 2,
        "chin_angle": _angle_at(p, idx.CHIN, idx.CHIN_WIDTH_R, idx.CHIN_WIDTH_L),
        "lower_face_ratio": _dist(p, idx.NOSE_TIP, idx.CHIN) / face_length,
        "mid_face_ratio": _dist(p, idx.GLABELLA, idx.NOSE_TIP) / face_length,
        "contour_curvature": _contour_curvature(p),
        "width_profile_slope": _width_profile_slope(p) / cheek,
        "ipd_cheek": _dist(p, idx.IRIS_R, idx.IRIS_L) / cheek,
        "symmetry": _symmetry(p) / cheek,
    }
    return {name: float(values[name]) for name in FEATURE_NAMES}


def head_pose_from_matrix(m: np.ndarray) -> tuple[float, float, float]:
    """Return `(yaw, pitch, roll)` in degrees from a 4x4 facial transformation matrix.

    Uses the rotation part `R = m[:3, :3]` (columns re-normalized to drop any scale) with
    the Z-Y-X decomposition `R = Rz(roll) @ Ry(yaw) @ Rx(pitch)`: yaw = rotation around the
    vertical (y) axis — the "turned sideways" angle the dataset filter thresholds.
    Sign convention: right-hand rule in MediaPipe's camera frame (y up), so positive yaw =
    rotation about +y.
    """
    m = np.asarray(m, dtype=np.float64)
    if m.shape != (4, 4):
        raise ValueError(f"Expected a 4x4 matrix, got shape {m.shape}.")
    col_norms = np.linalg.norm(m[:3, :3], axis=0)
    if np.any(col_norms < 1e-9):
        raise ValueError("Rotation part of the matrix has a zero column — cannot extract a pose.")
    r = m[:3, :3] / col_norms

    yaw = math.atan2(-r[2, 0], math.hypot(r[2, 1], r[2, 2]))
    pitch = math.atan2(r[2, 1], r[2, 2])
    roll = math.atan2(r[1, 0], r[0, 0])
    angles = (math.degrees(yaw), math.degrees(pitch), math.degrees(roll))
    if not all(math.isfinite(a) for a in angles):
        raise ValueError(f"Head pose is not finite: {angles}.")
    return angles
