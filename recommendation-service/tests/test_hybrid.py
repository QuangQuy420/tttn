"""Unit tests for `app/ml/hybrid.py` — the FinalScore math shared by serving and the offline
hybrid experiment (plan 12, T1): rank normalization, preference scales, `final_score`.

Pure numpy functions → plain asserts, no mocks.
"""
import numpy as np
import pytest

from app.ml.hybrid import PREFERENCE_NORMS, final_score, normalize_preference, rank_normalize


def test_rank_normalize_scales_ranks_to_0_1_with_average_rank_for_ties_AC12() -> None:
    # 0.2 < 0.5 == 0.5 < 0.9 → ranks 0, 1.5, 1.5, 3 scaled by n-1 = 3.
    assert rank_normalize(np.array([0.5, 0.9, 0.2, 0.5])) == pytest.approx([0.5, 1.0, 0.0, 0.5])
    assert rank_normalize(np.array([0.01])).tolist() == [1.0]


def test_normalize_preference_none_keeps_values_and_rank_puts_top_at_1_AC12() -> None:
    values = np.array([0.02, 0.01, 0.3])

    assert PREFERENCE_NORMS == ("none", "rank")
    assert normalize_preference(values, "none") == pytest.approx([0.02, 0.01, 0.3])
    assert normalize_preference(values, "rank") == pytest.approx([0.5, 0.0, 1.0])


def test_normalize_preference_rejects_an_unknown_mode() -> None:
    with pytest.raises(ValueError, match="unknown preference norm"):
        normalize_preference(np.array([0.1, 0.2]), "minmax")


def test_final_score_is_alpha_preference_plus_beta_face_fit_on_floats_and_arrays_AC9() -> None:
    assert final_score(0.5, 0.8, 0.6, 0.4) == pytest.approx(0.6 * 0.5 + 0.4 * 0.8)
    assert final_score(np.array([1.0, 0.0]), np.array([0.0, 1.0]), 0.7, 0.3) == pytest.approx([0.7, 0.3])
