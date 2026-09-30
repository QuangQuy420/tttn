"""Checks on the committed face-shape model export (`models/face_shape/<version>/`) produced by
`ml/face-shape` (plan 07). Loading it in `/analyze` is plan 08; here we only make sure the
artifact is loadable with the pinned scikit-learn/joblib and matches the feature schema.

Main flow only: the model card fields, and a `predict_proba` round-trip.
"""
import json
from pathlib import Path

import joblib
import numpy as np
import pytest

from app.db.models import FaceShape
from app.ml.face_features import FEATURE_NAMES, FEATURE_SCHEMA_VERSION

MODELS_DIR = Path(__file__).resolve().parent.parent / "models" / "face_shape"
MODEL_DIRS = sorted(p for p in MODELS_DIR.glob("*") if p.is_dir())
FACE_SHAPES = {shape.value for shape in FaceShape}


def test_at_least_one_model_is_committed():
    assert MODEL_DIRS, f"no exported model under {MODELS_DIR}"


@pytest.mark.parametrize("model_dir", MODEL_DIRS, ids=lambda p: p.name)
def test_model_card_matches_feature_schema(model_dir: Path):
    card = json.loads((model_dir / "model_card.json").read_text())

    for field in (
        "version",
        "algorithm",
        "classes",
        "feature_names",
        "feature_schema_version",
        "metrics",
        "library_versions",
    ):
        assert field in card
    assert card["version"] == model_dir.name
    assert set(card["classes"]) == FACE_SHAPES
    assert card["feature_names"] == list(FEATURE_NAMES)
    assert card["feature_schema_version"] == FEATURE_SCHEMA_VERSION
    assert (model_dir / "model.joblib").stat().st_size < 5 * 1024 * 1024


@pytest.mark.parametrize("model_dir", MODEL_DIRS, ids=lambda p: p.name)
def test_model_predicts_probabilities_for_every_face_shape(model_dir: Path):
    card = json.loads((model_dir / "model_card.json").read_text())
    model = joblib.load(model_dir / "model.joblib")

    assert list(model.classes_) == card["classes"]
    x = np.zeros((1, len(FEATURE_NAMES)))
    proba = model.predict_proba(x)
    assert proba.shape == (1, len(FACE_SHAPES))
    assert proba.sum() == pytest.approx(1.0)
