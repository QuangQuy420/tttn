"""Face-shape classifiers behind one interface: the trained ML model or the old rules.

`load_classifier(settings)` picks one by `FACE_SHAPE_CLASSIFIER` and is called once at boot
(via `get_face_shape_classifier`), so a missing/mismatched model stops the service before it
serves traffic instead of failing on the first request.
"""
import json
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal, Protocol

import joblib
import numpy as np
import sklearn

from app.core.config import Settings, get_settings
from app.db.models import FaceShape
from app.ml import face_features
from app.schemas.face import FaceMeasurements
from app.services.face_shape_service import classify_face_shape

logger = logging.getLogger(__name__)

# Exported models live in `models/face_shape/<version>/` (see ml/face-shape, plan 07).
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "models", "face_shape")
_MODEL_FILE = "model.joblib"
_MODEL_CARD_FILE = "model_card.json"

RULE_MODEL_VERSION = "rule-v0"


class ModelLoadError(Exception):
    """The configured model can't be served (missing files or schema/version mismatch)."""


@dataclass(frozen=True)
class ClassificationResult:
    face_shape: FaceShape
    confidence: float
    probabilities: dict[FaceShape, float]
    method: Literal["ml", "rule"]
    model_version: str


class FaceShapeClassifier(Protocol):
    name: str
    version: str

    def predict(
        self, features: dict[str, float], legacy: FaceMeasurements
    ) -> ClassificationResult:
        """Classify one face from its geometric `features` (ML) or `legacy` measurements (rule)."""


class RuleBasedClassifier:
    """Wraps the threshold rules (`classify_face_shape`) unchanged. `probabilities` is the
    one-hot of the rule label so downstream scoring (FaceFit) still works."""

    name = "rule"
    version = RULE_MODEL_VERSION

    def predict(
        self, features: dict[str, float], legacy: FaceMeasurements
    ) -> ClassificationResult:
        face_shape, confidence = classify_face_shape(legacy)
        probabilities = {shape: (1.0 if shape == face_shape else 0.0) for shape in FaceShape}
        return ClassificationResult(
            face_shape=face_shape,
            confidence=confidence,
            probabilities=probabilities,
            method="rule",
            model_version=self.version,
        )


class SklearnFaceShapeClassifier:
    """Serves an exported scikit-learn model (`predict_proba`) with its model card."""

    name = "ml"

    def __init__(self, model: Any, model_card: dict) -> None:
        self._model = model
        self._feature_names: list[str] = list(model_card["feature_names"])
        self._classes = [FaceShape(c) for c in model.classes_]
        self.version: str = model_card["version"]

    def predict(
        self, features: dict[str, float], legacy: FaceMeasurements
    ) -> ClassificationResult:
        vector = np.array([[features[name] for name in self._feature_names]], dtype=np.float64)
        proba = self._model.predict_proba(vector)[0]
        probabilities = {
            shape: round(float(p), 4) for shape, p in zip(self._classes, proba)
        }
        face_shape = max(probabilities, key=probabilities.__getitem__)
        return ClassificationResult(
            face_shape=face_shape,
            confidence=probabilities[face_shape],
            probabilities=probabilities,
            method="ml",
            model_version=self.version,
        )


def _check_library_version(model_card: dict) -> None:
    """Different sklearn major → refuse to load; any other difference → warning."""
    trained = str(model_card.get("library_versions", {}).get("sklearn", ""))
    installed = sklearn.__version__
    if not trained:
        logger.warning("Model card has no sklearn version — cannot check it against %s", installed)
        return
    if trained.split(".")[0] != installed.split(".")[0]:
        raise ModelLoadError(
            f"Model was trained with scikit-learn {trained} but {installed} is installed "
            "(different major version)."
        )
    if trained != installed:
        logger.warning(
            "Model was trained with scikit-learn %s but %s is installed", trained, installed
        )


def _load_sklearn_classifier(version: str) -> SklearnFaceShapeClassifier:
    model_dir = os.path.join(MODELS_DIR, version)
    model_path = os.path.join(model_dir, _MODEL_FILE)
    card_path = os.path.join(model_dir, _MODEL_CARD_FILE)
    for path in (model_path, card_path):
        if not os.path.isfile(path):
            raise ModelLoadError(f"Face-shape model file not found: {os.path.abspath(path)}")

    with open(card_path, encoding="utf-8") as f:
        model_card = json.load(f)

    schema_version = str(model_card.get("feature_schema_version"))
    if schema_version != face_features.FEATURE_SCHEMA_VERSION:
        raise ModelLoadError(
            f"Model {version} uses feature schema {schema_version}, "
            f"service computes schema {face_features.FEATURE_SCHEMA_VERSION}."
        )
    if list(model_card.get("feature_names", [])) != list(face_features.FEATURE_NAMES):
        raise ModelLoadError(f"Model {version} feature_names do not match FEATURE_NAMES.")
    expected_classes = {shape.value for shape in FaceShape}
    card_classes = model_card.get("classes", [])
    if len(card_classes) != len(expected_classes) or set(card_classes) != expected_classes:
        raise ModelLoadError(
            f"Model {version} classes {card_classes} are not the 6 FaceShape values."
        )
    if model_card.get("version") != version:
        logger.warning(
            "Model card version %s does not match its folder name %s",
            model_card.get("version"),
            version,
        )
    _check_library_version(model_card)

    model = joblib.load(model_path)
    model_classes = [str(c) for c in getattr(model, "classes_", [])]
    if set(model_classes) != expected_classes or len(model_classes) != len(expected_classes):
        raise ModelLoadError(
            f"Model {version} classes_ {model_classes} are not the 6 FaceShape values."
        )

    logger.info("Loaded face-shape model %s from %s", model_card["version"], model_dir)
    return SklearnFaceShapeClassifier(model, model_card)


def load_classifier(settings: Settings) -> FaceShapeClassifier:
    """Build the classifier chosen by `FACE_SHAPE_CLASSIFIER`. Raises `ModelLoadError` when
    the ML model can't be served. `rule` mode never touches the model folder."""
    if settings.FACE_SHAPE_CLASSIFIER == "rule":
        logger.info("Using the rule-based face-shape classifier (%s)", RULE_MODEL_VERSION)
        return RuleBasedClassifier()
    return _load_sklearn_classifier(settings.FACE_SHAPE_MODEL_VERSION)


@lru_cache
def get_face_shape_classifier() -> FaceShapeClassifier:
    """Process-wide classifier (loaded once) — also a FastAPI `Depends` provider."""
    return load_classifier(get_settings())
