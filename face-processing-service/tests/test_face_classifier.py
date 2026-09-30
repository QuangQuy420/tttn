"""Unit tests for the face-shape classifiers (`app/services/face_classifier.py`) and for
`FaceAnalysisService.analyze_and_store` wiring them in (plan 08).

Main flow only. The ML tests use the committed `fs-20260930-svm` export; no MediaPipe
model or real photo is needed (`analyze_face` is replaced by a stub in the service test).
"""
import asyncio
import threading
import uuid
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.db.models import FaceShape
from app.ml.face_features import FEATURE_NAMES
from app.schemas.face import FaceMeasurements, FaceQuality
from app.services import face_analysis_service
from app.services.face_analysis_service import FaceAnalysisService
from app.services.face_classifier import (
    ModelLoadError,
    RuleBasedClassifier,
    SklearnFaceShapeClassifier,
    load_classifier,
)
from app.services.face_shape_service import FaceAnalysisOutcome, classify_face_shape

MODEL_VERSION = "fs-20260930-svm"

_LEGACY = FaceMeasurements(
    face_length=0.4,
    forehead_width=0.3,
    cheekbone_width=0.35,
    jaw_width=0.3,
    length_to_width_ratio=1.3,
    cheekbone_to_jaw_ratio=0.9,
    forehead_to_jaw_ratio=1.0,
)
# Any finite value per feature is enough to exercise `predict_proba`.
_FEATURES = {name: 1.0 for name in FEATURE_NAMES}


def _settings(**overrides) -> Settings:
    return Settings(**{"FACE_SHAPE_MODEL_VERSION": MODEL_VERSION, **overrides})


def test_rule_classifier_matches_classify_face_shape() -> None:
    result = load_classifier(_settings(FACE_SHAPE_CLASSIFIER="rule")).predict(_FEATURES, _LEGACY)

    expected_shape, expected_confidence = classify_face_shape(_LEGACY)
    assert result.face_shape == expected_shape == FaceShape.OBLONG
    assert result.confidence == expected_confidence
    assert result.method == "rule"
    assert result.model_version == "rule-v0"
    assert result.probabilities[FaceShape.OBLONG] == 1.0
    assert sum(result.probabilities.values()) == 1.0


def test_ml_classifier_returns_calibrated_probabilities() -> None:
    classifier = load_classifier(_settings(FACE_SHAPE_CLASSIFIER="ml"))

    result = classifier.predict(_FEATURES, _LEGACY)

    assert isinstance(classifier, SklearnFaceShapeClassifier)
    assert result.method == "ml"
    assert result.model_version == MODEL_VERSION
    assert set(result.probabilities) == set(FaceShape)
    assert sum(result.probabilities.values()) == pytest.approx(1.0, abs=1e-3)
    assert result.confidence == max(result.probabilities.values())
    assert result.face_shape == max(result.probabilities, key=result.probabilities.__getitem__)


def test_ml_classifier_with_missing_model_version_fails_to_load() -> None:
    with pytest.raises(ModelLoadError):
        load_classifier(_settings(FACE_SHAPE_CLASSIFIER="ml", FACE_SHAPE_MODEL_VERSION="no-such-model"))


class _RecordingRepo:
    def __init__(self) -> None:
        self.created: dict | None = None

    async def create(self, **kwargs):
        self.created = kwargs
        return SimpleNamespace(id=uuid.uuid4())


class _FakeStorage:
    def upload(self, key: str, data: bytes, content_type: str) -> None:
        pass

    def get_presigned_url(self, key: str) -> str:
        return f"http://minio/{key}"


def test_analyze_and_store_runs_off_the_event_loop_and_persists_model_fields(monkeypatch) -> None:
    calls: dict = {}

    def fake_analyze_face(data, classifier, max_yaw_deg, min_cheek_px):
        calls["thread"] = threading.get_ident()
        calls["max_yaw_deg"] = max_yaw_deg
        calls["min_cheek_px"] = min_cheek_px
        return FaceAnalysisOutcome(
            measurements=_LEGACY,
            result=classifier.predict(_FEATURES, _LEGACY),
            quality=FaceQuality(yaw=3.2, pitch=-1.0, roll=0.5),
        )

    monkeypatch.setattr(face_analysis_service, "analyze_face", fake_analyze_face)
    repo = _RecordingRepo()
    service = FaceAnalysisService(_FakeStorage(), repo, RuleBasedClassifier(), 25.0)

    response = asyncio.run(
        service.analyze_and_store(uuid.uuid4(), b"img", "face.jpg", "image/jpeg")
    )

    assert calls["thread"] != threading.get_ident()
    assert calls["max_yaw_deg"] == 25.0
    assert calls["min_cheek_px"] == 80.0
    assert repo.created["method"] == "rule"
    assert repo.created["model_version"] == "rule-v0"
    assert repo.created["probabilities"]["OBLONG"] == 1.0
    assert response.method == "rule"
    assert response.modelVersion == "rule-v0"
    assert response.quality == FaceQuality(yaw=3.2, pitch=-1.0, roll=0.5)
    assert response.probabilities[FaceShape.OBLONG] == 1.0
