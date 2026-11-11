"""Plan 2026-09-29-12 (FaceFit hybrid): pure helpers of `recsys.experiment_hybrid` on a tiny
in-memory fixture (3 users x 5 items) - no dataset, no exported model, no full run."""
import numpy as np
import pandas as pd
import pytest

from app.schemas.recommend import FaceShape, FrameShape
from recsys import experiment_hybrid as eh
from recsys import face_noise, metrics

# 3 groups (= users) x 5 candidates, rows interleaved by group on purpose.
GROUP_POS = np.array([0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2])
PRODUCTS = np.array([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4])
# Raw calibrated preferences (~0.01 scale, no ties inside a group).
PREF = np.array(
    [0.011, 0.030, 0.002, 0.020, 0.004, 0.009, 0.005, 0.012, 0.015, 0.031, 0.001, 0.003, 0.008, 0.025, 0.007]
)
USER_SHAPES = [FaceShape.ROUND, FaceShape.SQUARE, FaceShape.HEART]
ITEM_FRAMES = [FrameShape.ROUND, FrameShape.RECTANGLE, FrameShape.CAT_EYE, FrameShape.AVIATOR, FrameShape.RIMLESS]


def _fit() -> np.ndarray:
    """True-shape FaceFit per row from the service table (rows of `one_hot_fit_table`)."""
    table = eh.one_hot_fit_table()
    shape_idx = np.array([face_noise.FACE_SHAPES.index(shape) for shape in USER_SHAPES])
    frame_idx = np.array([eh.FRAME_SHAPES.index(ITEM_FRAMES[p]) for p in PRODUCTS])
    return table[shape_idx[GROUP_POS], frame_idx]


def _ranking(scores: np.ndarray) -> list[list[int]]:
    top = metrics.top_k(GROUP_POS, scores, PRODUCTS, k=5)
    return [top[top["group_id"] == g].sort_values("rank")["product_id"].tolist() for g in range(3)]


def test_alpha_grid_coarse_for_both_norms_and_fine_grid_for_none_ac1():
    """AC1/AC11: alpha 0..1 step 0.1 for both norms; `none` adds 0.90..1.00 step 0.01 + 0.995, 0.999."""
    coarse = [round(i / 10, 1) for i in range(11)]
    fine = [round(0.9 + i / 100, 2) for i in range(11)] + [0.995, 0.999]

    assert eh.alphas_for("rank") == coarse
    none = eh.alphas_for("none")
    assert none == sorted(none)
    assert set(none) == set(coarse) | set(fine)
    assert len(none) == len(set(none))


def test_fit_table_of_one_hot_rows_equals_the_service_one_hot_table_ac6():
    """AC6: soft FaceFit of one-hot probabilities == hard FaceFit (service `face_fit` / `one_hot`)."""
    table = eh.one_hot_fit_table()

    assert table.shape == (6, 8)
    np.testing.assert_allclose(eh.fit_table(np.eye(6)), table)


@pytest.mark.parametrize("norm", ["none", "rank"])
def test_alpha_one_is_pref_only_and_alpha_zero_is_facefit_only_ranking_ac1(norm):
    """AC1/AC11: final(alpha=1) ranks like preference alone, final(alpha=0) like FaceFit alone."""
    pref = eh.normalize_per_group(PREF, GROUP_POS, norm)
    fit = _fit()
    assert _ranking(pref) != _ranking(fit)  # the fixture can tell the two apart

    assert _ranking(eh.final_scores(pref, fit, 1.0)) == _ranking(pref)
    assert _ranking(eh.final_scores(pref, fit, 0.0)) == _ranking(fit)
    np.testing.assert_allclose(eh.final_scores(pref, fit, 0.6), 0.6 * pref + 0.4 * fit)


def test_normalize_per_group_rank_scales_each_group_and_none_is_identity_ac11():
    """AC11: `rank` = rank in [0, 1] inside every group (top = 1.0, order kept); `none` unchanged."""
    ranked = eh.normalize_per_group(PREF, GROUP_POS, "rank")

    np.testing.assert_array_equal(eh.normalize_per_group(PREF, GROUP_POS, "none"), PREF)
    for g in range(3):
        rows = GROUP_POS == g
        assert sorted(ranked[rows]) == [0.0, 0.25, 0.5, 0.75, 1.0]
        np.testing.assert_array_equal(np.argsort(ranked[rows]), np.argsort(PREF[rows]))


def test_facefit_filter_puts_suitable_frames_strictly_first_ac15():
    """AC15: rows with FaceFit >= 0.5 come before all others; preference order inside each block."""
    fit = _fit()
    assert (fit >= 0.5).any() and (fit < 0.5).any()

    scores = eh.filter_scores(PREF, fit)

    for g in range(3):
        rows = np.flatnonzero(GROUP_POS == g)
        order = rows[np.argsort(-scores[rows], kind="stable")]
        suitable = fit[order] >= 0.5
        assert list(suitable) == sorted(suitable, reverse=True)
        for block in (order[suitable], order[~suitable]):
            assert list(PREF[block]) == sorted(PREF[block], reverse=True)


def test_select_config_argmax_then_larger_alpha_then_none_ac8():
    """AC8: argmax of the val curve; ties -> larger alpha, then norm `none`."""
    assert eh.select_config({("none", 0.5): 0.30, ("rank", 0.6): 0.40, ("rank", 0.7): 0.35}) == ("rank", 0.6)
    assert eh.select_config({("none", 0.5): 0.40, ("rank", 0.7): 0.40, ("none", 0.2): 0.40}) == ("rank", 0.7)
    assert eh.select_config({("rank", 0.7): 0.40, ("none", 0.7): 0.40, ("rank", 0.1): 0.30}) == ("none", 0.7)


def test_select_config_fallback_excludes_pref_only_when_alpha_star_is_one_ac7_ac8():
    """AC7/AC8: alpha* = 1 -> the comparison config is the best alpha < 1 (same tie rule)."""
    val_curve = {("none", 1.0): 0.50, ("rank", 1.0): 0.50, ("none", 0.99): 0.45, ("rank", 0.6): 0.45, ("rank", 0.2): 0.10}

    assert eh.select_config(val_curve) == ("none", 1.0)
    assert eh.select_config(val_curve, exclude_pref_only=True) == ("none", 0.99)


def _result(ndcg: list[float]) -> eh.Result:
    return eh.Result(per_user=pd.DataFrame({eh.SELECTION_METRIC: ndcg}), coverage={})


def test_paired_compares_config_to_pref_only_of_the_same_norm_on_masked_users_ac7():
    """AC7: per-user NDCG@10 of final(norm, alpha) minus pref_only(norm), restricted to the mask."""
    results = {
        eh.final_key("noisy_soft", "rank", 0.6): _result([0.6, 0.8, 0.1]),
        eh.final_key("noisy_soft", "rank", 1.0): _result([0.5, 0.4, 0.9]),
        eh.final_key("noisy_soft", "none", 1.0): _result([0.0, 0.0, 0.0]),
    }
    mask = np.array([True, True, False])

    out = eh.paired(results, "noisy_soft", "rank", 0.6, mask, seed=1)

    assert out["delta"] == pytest.approx(0.25)
    assert out["config"] == pytest.approx(0.7)
    assert out["pref_only"] == pytest.approx(0.45)
    assert out["n_users"] == 2
    assert out["compared"] == "final(norm=rank, alpha=0.600) - pref_only"
    assert out["ci_low"] > 0.0
