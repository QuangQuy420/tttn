"""FinalScore math shared by serving (`ranking_service.rank`) and the offline hybrid
experiment (`ml/recommendation`, imported through `PYTHONPATH`, plan 12).

- `normalize_preference` rescales the PreferenceScores of ONE candidate list:
  `none` keeps the calibrated values (median ≈ 0.01, so FaceFit dominates the sum),
  `rank` replaces them by their rank scaled to [0, 1] (top = 1.0), on the same scale as
  FaceFit. Both keep the preference order.
- `final_score = α·preference + β·faceFit` on floats or arrays.

Pure, numpy only (no FastAPI, no I/O).
"""
from typing import TypeVar

import numpy as np

PREFERENCE_NORMS: tuple[str, ...] = ("none", "rank")

_Score = TypeVar("_Score", float, np.ndarray)


def rank_normalize(values: np.ndarray) -> np.ndarray:
    """Rank of each value scaled to [0, 1] by `n − 1` (ties share their average rank), as
    float64. One value → `[1.0]`; empty → empty."""
    values = np.asarray(values, dtype=np.float64).reshape(-1)
    n = len(values)
    if n == 0:
        return np.empty(0, dtype=np.float64)
    if n == 1:
        return np.ones(1, dtype=np.float64)

    order = np.argsort(values, kind="stable")
    sorted_values = values[order]
    ranks = np.empty(n, dtype=np.float64)
    start = 0
    while start < n:
        end = start
        while end + 1 < n and sorted_values[end + 1] == sorted_values[start]:
            end += 1
        ranks[order[start : end + 1]] = (start + end) / 2.0
        start = end + 1
    return ranks / (n - 1)


def normalize_preference(values: np.ndarray, mode: str) -> np.ndarray:
    """PreferenceScores of one candidate list on the `mode` scale (see module docstring)."""
    if mode not in PREFERENCE_NORMS:
        raise ValueError(f"unknown preference norm: {mode!r}")
    if mode == "rank":
        return rank_normalize(values)
    return np.asarray(values, dtype=np.float64).reshape(-1)


def final_score(preference: _Score, face_fit: _Score, alpha: float, beta: float) -> _Score:
    """`alpha * preference + beta * face_fit` (floats or arrays)."""
    return alpha * preference + beta * face_fit
