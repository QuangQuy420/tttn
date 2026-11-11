"""Unit tests for `app/ml/face_fit.py` — FaceFitScore built from the static 0–10
compatibility table ÷ 10, weighted by the face-shape probabilities (plan 11, T2).
Pure functions → plain asserts, no mocks.
"""
import pytest

from app.core.face_shape_mapping import FACE_SHAPE_TO_FRAME_SHAPES
from app.ml.face_fit import face_fit, one_hot
from app.schemas.recommend import FaceShape, FrameShape


def test_face_fit_of_a_one_hot_face_equals_the_table_score_divided_by_10_AC3() -> None:
    for face_shape, pairs in FACE_SHAPE_TO_FRAME_SHAPES.items():
        for frame_shape, table_score in pairs:
            assert face_fit(one_hot(face_shape), frame_shape) == pytest.approx(table_score / 10)


def test_face_fit_weights_every_face_shape_by_its_probability_AC7() -> None:
    # ROUND→SQUARE = 10, SQUARE→SQUARE = 1 in the table.
    probs = {FaceShape.ROUND: 0.6, FaceShape.SQUARE: 0.4}

    assert face_fit(probs, FrameShape.SQUARE) == pytest.approx(0.6 * 1.0 + 0.4 * 0.1)
    # Not just the top-1 label (which alone would give 1.0).
    assert face_fit(probs, FrameShape.SQUARE) < face_fit(one_hot(FaceShape.ROUND), FrameShape.SQUARE)
