"""Unit tests for the pure-numpy landmark normalization + geometric feature module
(`app.ml.face_features`) shared by `ml/face-shape` (training) and, later, `/analyze`
(serving). Synthetic landmark arrays only — no MediaPipe model or real photo needed.

Main flow only: the aspect-ratio fix, roll/scale invariance of the features, the feature
schema, and the head-pose decomposition.
"""
import math

import numpy as np
import pytest

from app.ml.face_features import (
    FEATURE_NAMES,
    NUM_LANDMARKS,
    LandmarkIdx,
    compute_features,
    head_pose_from_matrix,
    normalize,
    to_pixels,
)


def _synthetic_face_px(width: float = 300.0, height: float = 400.0) -> np.ndarray:
    """A symmetric, face-like `(478, 2)` pixel landmark array.

    The 36 `FACE_OVAL` points sit on an ellipse (10 at the top, 454 on the image right,
    152 at the bottom, 234 on the image left), plus plausible eyes/irises/nose/glabella.
    Every other landmark is a fixed point inside the face so the array is complete.
    """
    rng = np.random.default_rng(0)
    center = np.array([500.0, 500.0])
    a, b = width / 2, height / 2
    points = center + rng.uniform(-0.3, 0.3, size=(NUM_LANDMARKS, 2)) * [a, b]

    for i, idx in enumerate(LandmarkIdx.FACE_OVAL):
        angle = math.radians(-90 + i * 10)
        points[idx] = center + [a * math.cos(angle), b * math.sin(angle)]

    fixed = {
        LandmarkIdx.GLABELLA: (0.0, -0.3),
        LandmarkIdx.NOSE_TIP: (0.0, 0.2),
        LandmarkIdx.EYE_OUTER_R: (-0.4, -0.25),
        LandmarkIdx.EYE_OUTER_L: (0.4, -0.25),
        LandmarkIdx.IRIS_R: (-0.3, -0.25),
        LandmarkIdx.IRIS_L: (0.3, -0.25),
    }
    for idx, (fx, fy) in fixed.items():
        points[idx] = center + [fx * a, fy * b]
    return points


def _rotate(points: np.ndarray, degrees: float, pivot: np.ndarray) -> np.ndarray:
    theta = math.radians(degrees)
    rotation = np.array([[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]])
    return (points - pivot) @ rotation.T + pivot


def _features(points_px: np.ndarray) -> np.ndarray:
    return np.array(list(compute_features(normalize(points_px)).values()))


def test_to_pixels_restores_true_distances_on_non_square_image():
    # A 50x50 px square on a 200x100 image is 0.25 wide and 0.5 tall in normalized coords —
    # the old normalized-space distance would call it a 1:2 rectangle.
    normalized = np.array([[0.25, 0.25], [0.5, 0.25], [0.25, 0.75]])

    px = to_pixels(normalized, 200, 100)

    assert px.tolist() == [[50.0, 25.0], [100.0, 25.0], [50.0, 75.0]]
    assert np.linalg.norm(px[1] - px[0]) == pytest.approx(np.linalg.norm(px[2] - px[0]))


def test_features_are_roll_invariant_after_normalize():
    face = _synthetic_face_px()

    rotated = _rotate(face, 15.0, pivot=np.array([123.0, 456.0]))

    np.testing.assert_allclose(_features(rotated), _features(face), atol=1e-9)


def test_features_are_scale_invariant():
    face = _synthetic_face_px()

    np.testing.assert_allclose(_features(face * 3.0), _features(face), atol=1e-9)


def test_compute_features_returns_exactly_the_feature_schema_in_order():
    features = compute_features(normalize(_synthetic_face_px()))

    assert tuple(features) == FEATURE_NAMES
    assert len(FEATURE_NAMES) == 20
    assert all(math.isfinite(v) for v in features.values())
    # Sanity on the synthetic 300x400 ellipse: cheekbone width is the widest span, so the
    # length/width ratio is > 1 and the face is left-right symmetric.
    assert features["lw_ratio"] > 1.0
    assert features["symmetry"] == pytest.approx(0.0, abs=1e-9)


def test_compute_features_rejects_a_wrongly_shaped_array():
    with pytest.raises(ValueError):
        compute_features(np.zeros((10, 2)))


def test_head_pose_from_identity_matrix_is_zero():
    yaw, pitch, roll = head_pose_from_matrix(np.eye(4))

    assert (yaw, pitch, roll) == pytest.approx((0.0, 0.0, 0.0), abs=1e-9)


def test_head_pose_reads_yaw_from_a_rotation_around_the_vertical_axis():
    theta = math.radians(30)
    m = np.eye(4)
    m[:3, :3] = [
        [math.cos(theta), 0.0, math.sin(theta)],
        [0.0, 1.0, 0.0],
        [-math.sin(theta), 0.0, math.cos(theta)],
    ]

    yaw, pitch, roll = head_pose_from_matrix(m)

    assert yaw == pytest.approx(30.0)
    assert pitch == pytest.approx(0.0, abs=1e-9)
    assert roll == pytest.approx(0.0, abs=1e-9)
