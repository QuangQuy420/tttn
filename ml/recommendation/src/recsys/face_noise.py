"""Noisy face shapes for the hybrid experiment (plan 12, T5).

The face-shape classifier (AI 1, SVM of run `v2-full-real-20261005`) wrote one probability vector
per test image to `test_probabilities_svm.csv` (`true_label, p_<FaceShape>...`). A simulated user
whose true shape is `s` gets `n_draws` images drawn at random among the images with
`true_label == s`:

- `noisy_soft` = the drawn image's probability vector,
- `noisy_hard` = `one_hot(argmax)` of the SAME image.

Draws are keyed by `user_id` (users drawn in sorted order from one seeded generator), so every
configuration, preference norm and split reuses the same draws (common random numbers). Classes
are always matched by name (`FaceShape`), never by column position.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from app.schemas.recommend import FaceShape

TRUE_LABEL_COLUMN = "true_label"
PROB_PREFIX = "p_"
FACE_SHAPES: tuple[FaceShape, ...] = tuple(FaceShape)
_SUM_TOLERANCE = 1e-3


@dataclass(frozen=True)
class FaceProbabilities:
    """Test images of AI 1: `labels[i]` = true shape, `probs[i]` in `FACE_SHAPES` order."""

    labels: np.ndarray  # (n,) str
    probs: np.ndarray  # (n, 6) float64

    def hard(self) -> np.ndarray:
        """One-hot of the argmax of every image, (n, 6) in `FACE_SHAPES` order."""
        hard = np.zeros_like(self.probs)
        hard[np.arange(len(self.probs)), np.argmax(self.probs, axis=1)] = 1.0
        return hard


def load_face_probabilities(path: Path) -> FaceProbabilities:
    """Read and validate the probabilities CSV (class names checked against `FaceShape`)."""
    if not path.is_file():
        raise FileNotFoundError(f"{path} not found - run `make test-probabilities` in ml/face-shape first")
    frame = pd.read_csv(path)
    expected = {f"{PROB_PREFIX}{shape.value}" for shape in FACE_SHAPES}
    prob_columns = {column for column in frame.columns if column != TRUE_LABEL_COLUMN}
    if TRUE_LABEL_COLUMN not in frame.columns or prob_columns != expected:
        raise ValueError(f"{path}: columns {sorted(frame.columns)} != {TRUE_LABEL_COLUMN} + {sorted(expected)}")
    labels = frame[TRUE_LABEL_COLUMN].astype(str).to_numpy()
    unknown = sorted(set(labels) - {shape.value for shape in FACE_SHAPES})
    if unknown:
        raise ValueError(f"{path}: unknown true_label values {unknown}")
    probs = frame[[f"{PROB_PREFIX}{shape.value}" for shape in FACE_SHAPES]].to_numpy(dtype=np.float64)
    if np.any(probs < 0) or np.any(np.abs(probs.sum(axis=1) - 1.0) > _SUM_TOLERANCE):
        raise ValueError(f"{path}: probability rows must be >= 0 and sum to 1")
    return FaceProbabilities(labels=labels, probs=probs)


def draw_images(
    true_shapes: Mapping[str, str], image_labels: np.ndarray, n_draws: int, seed: int
) -> pd.DataFrame:
    """`n_draws` image indices per user (index = sorted `user_id`, columns `0..n_draws-1`), each
    drawn uniformly with replacement among the images whose true label is the user's shape."""
    pools = {shape.value: np.flatnonzero(image_labels == shape.value) for shape in FACE_SHAPES}
    rng = np.random.default_rng(seed)
    user_ids = sorted(true_shapes)
    draws = np.empty((len(user_ids), n_draws), dtype=np.int64)
    for i, user_id in enumerate(user_ids):
        pool = pools.get(str(true_shapes[user_id]))
        if pool is None or len(pool) == 0:
            raise ValueError(f"no test image with true_label {true_shapes[user_id]!r} (user {user_id})")
        draws[i] = pool[rng.integers(0, len(pool), size=n_draws)]
    return pd.DataFrame(draws, index=pd.Index(user_ids, name="user_id"))


def as_probs(vector: np.ndarray) -> dict[FaceShape, float]:
    """A row in `FACE_SHAPES` order as the `{FaceShape: p}` mapping `face_fit` takes."""
    return {shape: float(p) for shape, p in zip(FACE_SHAPES, vector)}
