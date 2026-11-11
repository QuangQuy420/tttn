"""PreferenceScore model loaded once at startup — `(xgboost.Booster, model_card)` singleton.

`load_preference_model` runs inside the app lifespan (`app/main.py`). It raises when the
version folder is missing, the card's `feature_schema_version` differs from
`app.ml.features.FEATURE_SCHEMA_VERSION`, or the card lacks `price_band_edges` /
`calibration.{method,a,b,raw_score}`, so the app fails to start (and the container fails
its healthcheck) instead of serving scores from a mismatched model.

An unset/empty `PREFERENCE_MODEL_VERSION` is legacy mode: nothing is loaded and
`get_preference_model()` returns None (tests stay model-free). `xgboost` is imported lazily
so `import app.main` works without it.
"""
import json
import logging
from pathlib import Path
from typing import Any

from app.ml.features import FEATURE_SCHEMA_VERSION

logger = logging.getLogger(__name__)

# Resolved from this file, not the CWD (tests run from `tests/`): <service>/models/preference.
MODELS_DIR = Path(__file__).resolve().parents[2] / "models" / "preference"
MODEL_FILE = "model.json"
CARD_FILE = "model_card.json"
# `calibration` keys `rank()` needs (with `price_band_edges`).
CALIBRATION_KEYS = ("method", "a", "b", "raw_score")

PreferenceModel = tuple[Any, dict[str, Any]]  # (xgboost.Booster, model_card)

_preference_model: PreferenceModel | None = None


class ModelLoadError(Exception):
    """The configured preference model cannot be served (missing files / schema mismatch)."""


def load_preference_model(version: str) -> PreferenceModel | None:
    """Load `models/preference/{version}/` into the singleton; None (legacy mode) when
    `version` is empty. Raises `ModelLoadError` on a missing folder or schema mismatch."""
    global _preference_model
    version = version.strip()
    if not version:
        _preference_model = None
        logger.warning("PREFERENCE_MODEL_VERSION is not set — legacy mode (preference = popularity)")
        return None

    model_dir = MODELS_DIR / version
    model_path = model_dir / MODEL_FILE
    card_path = model_dir / CARD_FILE
    if not model_path.is_file() or not card_path.is_file():
        raise ModelLoadError(f"Preference model {version!r} not found in {model_dir}")

    card: dict[str, Any] = json.loads(card_path.read_text(encoding="utf-8"))
    schema = card.get("feature_schema_version")
    if schema != FEATURE_SCHEMA_VERSION:
        raise ModelLoadError(
            f"Preference model {version!r} has feature_schema_version {schema!r}, "
            f"code expects {FEATURE_SCHEMA_VERSION!r}"
        )
    # `rank()` reads these per request — fail at startup, not on the first recommendation.
    if not isinstance(card.get("price_band_edges"), list) or not card["price_band_edges"]:
        raise ModelLoadError(f"Preference model {version!r} card has no price_band_edges")
    calibration = card.get("calibration")
    missing = [
        key
        for key in CALIBRATION_KEYS
        if not isinstance(calibration, dict) or calibration.get(key) is None
    ]
    if missing:
        raise ModelLoadError(
            f"Preference model {version!r} card has no calibration.{', calibration.'.join(missing)}"
        )

    import xgboost

    booster = xgboost.Booster(model_file=str(model_path))
    _preference_model = (booster, card)
    logger.info("Loaded preference model %s", card.get("version", version))
    return _preference_model


def get_preference_model() -> PreferenceModel | None:
    """The model loaded at startup, or None in legacy mode."""
    return _preference_model
