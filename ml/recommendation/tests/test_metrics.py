"""Plan 2026-09-29-10 (PreferenceScore training): ranking metrics + baselines on hand-made rows."""
import math

import numpy as np
import pandas as pd
import pytest

from recsys import baselines, metrics


def _toy_per_user() -> pd.DataFrame:
    # u1: graded labels [1, 0, 1] ranked by score (3 > 2 > 1); u2: no relevant row (skipped).
    # u3: tie at 0.5 broken by product_id ascending -> "a" (label 2) first, "b" (label 0) second.
    groups = np.array(["u1", "u1", "u1", "u2", "u2", "u3", "u3"])
    labels = np.array([1, 0, 1, 0, 0, 0, 2])
    scores = np.array([3.0, 2.0, 1.0, 0.9, 0.1, 0.5, 0.5])
    products = np.array(["p1", "p2", "p3", "p1", "p2", "b", "a"])
    return metrics.per_user_metrics(groups, labels, scores, products, ks=(1, 3))


def test_precision_recall_hitrate_ndcg_match_hand_computed_values_ac5():
    """AC5: P/R/HR/NDCG@K on toy rankings; users with an empty R_u are skipped."""
    per_user = _toy_per_user()

    assert list(per_user.index) == ["u1", "u3"]
    assert list(per_user.columns) == metrics.metric_names((1, 3))

    u1 = per_user.loc["u1"]
    # DCG@3 = 1/log2(2) + 0 + 1/log2(4) = 1.5; IDCG@3 = 1 + 1/log2(3).
    assert u1["precision@3"] == pytest.approx(2 / 3)
    assert u1["recall@3"] == pytest.approx(1.0)
    assert u1["hitrate@3"] == pytest.approx(1.0)
    assert u1["ndcg@3"] == pytest.approx(1.5 / (1 + 1 / math.log2(3)))
    assert u1["precision@1"] == pytest.approx(1.0)
    assert u1["recall@1"] == pytest.approx(0.5)
    assert u1["ndcg@1"] == pytest.approx(1.0)

    u3 = per_user.loc["u3"]
    assert u3["hitrate@1"] == pytest.approx(1.0)
    assert u3["ndcg@3"] == pytest.approx(1.0)


def test_bootstrap_ci_is_seeded_and_contains_the_mean_ac6():
    """AC6: user bootstrap, same seed -> same interval, interval holds the point mean."""
    rng = np.random.default_rng(0)
    per_user = pd.DataFrame({"hitrate@10": rng.integers(0, 2, 200).astype(float), "ndcg@10": rng.random(200)})

    first = metrics.bootstrap_ci(per_user, n_resamples=200, seed=7)
    again = metrics.bootstrap_ci(per_user, n_resamples=200, seed=7)

    assert first == again
    for name, cell in first.items():
        assert cell["mean"] == pytest.approx(per_user[name].mean())
        assert cell["ci_low"] <= cell["mean"] <= cell["ci_high"]
        assert cell["ci_low"] < cell["ci_high"]


def test_bootstrap_ci_without_users_gives_nan():
    """Error case: no user with a relevant row -> NaN cells, no crash."""
    cell = metrics.bootstrap_ci(pd.DataFrame(columns=["ndcg@10"], dtype=float))["ndcg@10"]
    assert all(math.isnan(value) for value in cell.values())


def test_baselines_score_with_the_fixed_formulas_ac1():
    """AC1: popularity = p_log_pop; content = mean(4 affinities, 1 - min(|z|, 3) / 3)."""
    frame = pd.DataFrame(
        {
            "p_log_pop": [2.5, 0.0],
            "x_cos_shape": [1.0, 0.0],
            "x_cos_material": [0.5, 0.0],
            "x_color_affinity": [0.0, 0.2],
            "x_brand_affinity": [1.0, 0.3],
            "x_price_abs_z": [1.5, 6.0],
        }
    )

    assert set(baselines.BASELINES) == {"popularity", "content"}
    np.testing.assert_allclose(baselines.BASELINES["popularity"](frame), [2.5, 0.0])
    # row 0: (1 + 0.5 + 0 + 1 + 0.5) / 5; row 1: price_fit capped at 0 -> (0 + 0 + 0.2 + 0.3 + 0) / 5.
    np.testing.assert_allclose(baselines.BASELINES["content"](frame), [0.6, 0.1])


def test_paired_bootstrap_identical_inputs_give_zero_delta_and_p_one_ac7():
    """AC7 (plan 12): same per-user values -> delta 0, CI [0, 0], p = 1."""
    values = np.array([0.2, 0.5, 0.9, 0.0, 1.0])

    out = metrics.paired_bootstrap(values, values.copy(), n_resamples=200, seed=7)

    assert out == {"delta": 0.0, "ci_low": 0.0, "ci_high": 0.0, "p_value": 1.0}


def test_paired_bootstrap_clearly_better_input_has_ci_above_zero_and_is_seeded_ac7():
    """AC7 (plan 12): a beats b for every user -> delta > 0, CI above 0, small p; same seed, same CI."""
    rng = np.random.default_rng(0)
    b = rng.uniform(0.0, 0.5, size=50)
    a = b + rng.uniform(0.1, 0.3, size=50)

    out = metrics.paired_bootstrap(a, b, n_resamples=500, seed=3)

    assert out["delta"] == pytest.approx(float(np.mean(a - b)))
    assert 0.0 < out["ci_low"] <= out["delta"] <= out["ci_high"]
    assert out["p_value"] == 0.0
    assert metrics.paired_bootstrap(a, b, n_resamples=500, seed=3) == out
