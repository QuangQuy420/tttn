"""Unit tests for `app/core/model_registry.py` — the preference model loaded at startup
(plan 11, T3). The schema-mismatch check runs before `xgboost` is touched, so it uses a
fake model folder; the committed model is loaded once to prove the real card passes.
"""
import json
from pathlib import Path

import pytest

from app.core import model_registry
from app.core.model_registry import ModelLoadError, get_preference_model, load_preference_model
from app.ml.features import FEATURE_SCHEMA_VERSION

_COMMITTED_VERSION = "v1-sim-20261110-xgbrank"


@pytest.fixture(autouse=True)
def _reset_singleton(monkeypatch: pytest.MonkeyPatch) -> None:
    # Restored after each test, so a loaded model never leaks into other tests.
    monkeypatch.setattr(model_registry, "_preference_model", None)


def _write_model(models_dir: Path, version: str, schema: str) -> None:
    folder = models_dir / version
    folder.mkdir(parents=True)
    (folder / "model.json").write_text("{}", encoding="utf-8")
    (folder / "model_card.json").write_text(
        json.dumps({"version": version, "feature_schema_version": schema}), encoding="utf-8"
    )


def test_load_raises_when_the_card_feature_schema_differs_from_the_code_AC12(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(model_registry, "MODELS_DIR", tmp_path)
    _write_model(tmp_path, "v-old", schema="rec-v0")

    with pytest.raises(ModelLoadError, match="feature_schema_version"):
        load_preference_model("v-old")
    assert get_preference_model() is None


def test_load_raises_when_the_card_has_no_calibration_AC57(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(model_registry, "MODELS_DIR", tmp_path)
    folder = tmp_path / "v-no-calibration"
    folder.mkdir()
    (folder / "model.json").write_text("{}", encoding="utf-8")
    (folder / "model_card.json").write_text(
        json.dumps(
            {
                "version": "v-no-calibration",
                "feature_schema_version": FEATURE_SCHEMA_VERSION,
                "price_band_edges": [900_000.0, 1_800_000.0, 4_200_000.0],
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ModelLoadError, match="calibration"):
        load_preference_model("v-no-calibration")
    assert get_preference_model() is None


def test_load_with_an_empty_version_is_legacy_mode() -> None:
    assert load_preference_model("") is None
    assert get_preference_model() is None


def test_load_the_committed_model_holds_booster_and_card_AC12() -> None:
    booster, card = load_preference_model(_COMMITTED_VERSION)

    assert card["feature_schema_version"] == FEATURE_SCHEMA_VERSION
    assert card["version"] == _COMMITTED_VERSION
    assert hasattr(booster, "inplace_predict")
    assert get_preference_model() == (booster, card)
