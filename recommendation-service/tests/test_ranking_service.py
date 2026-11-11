"""Unit tests for `app/services/ranking_service.py` — the hybrid ranking math (plan 11, T6):
`final = α·preference + β·faceFit`, cold-start popularity, diversity caps, reasons.

Pure functions over plain inputs. The preference model is a tiny fake `xgboost.Booster`
(`inplace_predict` margin) so the real feature code (`app.ml.features`) and scoring code
(`app.ml.preference`) run unchanged without loading the committed model.
"""
from datetime import UTC, datetime, timedelta

import numpy as np
import pytest

from app.ml import features as F
from app.ml.face_fit import face_fit
from app.schemas.recommend import FaceShape
from app.services.ranking_service import (
    FaceInput,
    ScoredProduct,
    diversify,
    effective_weights,
    rank,
)

NOW = datetime(2026, 11, 1, tzinfo=UTC)
_COS_SHAPE = F.feature_names().index("x_cos_shape")
_CARD = {
    "price_band_edges": [900_000.0, 1_800_000.0, 4_200_000.0],
    "calibration": {"method": "sigmoid", "raw_score": "margin", "a": 1.0, "b": 0.0},
}


class _ShapeAffinityBooster:
    """`xgboost.Booster`-like: margin = 4·x_cos_shape − 2, so products whose frame shape the
    user interacted with score higher."""

    def inplace_predict(self, X: np.ndarray, predict_type: str = "value") -> np.ndarray:
        assert predict_type == "margin"
        return 4.0 * X[:, _COS_SHAPE] - 2.0


class _UnusedBooster:
    def inplace_predict(self, X: np.ndarray, predict_type: str = "value") -> np.ndarray:
        raise AssertionError("the model must not run for a cold-start user")


def _product(pid: str, shape: str, brand: str = "Brand A", price: float = 1_000_000.0) -> F.Product:
    return F.Product(
        product_id=pid,
        brand=brand,
        frame_shape=shape,
        material_type="ACETATE",
        gender_target="UNISEX",
        base_price=price,
        colors=("black",),
    )


def _event(user: str, pid: str, event_type: str = F.VIEW, days_ago: float = 1.0) -> F.Event:
    return F.Event(user, pid, event_type, NOW - timedelta(days=days_ago))


def _catalog(*products: F.Product) -> dict[str, F.Product]:
    return {p.product_id: p for p in products}


def test_users_with_different_behavior_get_different_rankings_AC2() -> None:
    catalog = _catalog(
        _product("r1", "ROUND"),
        _product("s1", "SQUARE"),
        _product("r2", "ROUND"),
        _product("s2", "SQUARE"),
    )
    model = (_ShapeAffinityBooster(), _CARD)

    def top_for(events: list[F.Event]) -> str:
        ranked = rank(catalog, ["r2", "s2"], events, F.ProductStats(), NOW, model, None, 0.6, 0.0)
        return ranked[0].product_id

    assert top_for([_event("u-round", "r1"), _event("u-round", "r1", F.LIKE)]) == "r2"
    assert top_for([_event("u-square", "s1"), _event("u-square", "s1", F.LIKE)]) == "s2"


def test_final_score_is_alpha_preference_plus_beta_face_fit_with_scores_in_0_1_AC3_AC4_AC7() -> None:
    catalog = _catalog(_product("r1", "ROUND"), _product("r2", "ROUND"), _product("s2", "SQUARE"))
    probs = {FaceShape.ROUND: 0.7, FaceShape.OVAL: 0.3}
    face = FaceInput(probs, FaceShape.ROUND)
    events = [_event("u1", "r1"), _event("u1", "r1", F.LIKE)]

    ranked = rank(
        catalog, ["r2", "s2"], events, F.ProductStats(), NOW, (_ShapeAffinityBooster(), _CARD), face, 0.6, 0.4
    )

    by_id = {item.product_id: item for item in ranked}
    for item in ranked:
        assert 0.0 < item.preference < 1.0
        assert 0.0 <= item.face_fit <= 1.0
        assert item.final == pytest.approx(0.6 * item.preference + 0.4 * item.face_fit)
    # FaceFit uses the whole probability vector (AC7).
    assert by_id["s2"].face_fit == pytest.approx(face_fit(probs, "SQUARE"))
    assert by_id["s2"].face_fit == pytest.approx(0.7 * 1.0 + 0.3 * 0.8)
    # Vietnamese reasons, top-1 face-shape label, at most 2 (AC3).
    assert by_id["s2"].reasons[0] == "Hợp dáng mặt Tròn"
    assert by_id["r2"].reasons[0] == "Giống kiểu gọng bạn hay xem"
    assert all(len(item.reasons) <= 2 for item in ranked)


def test_without_a_face_analysis_beta_is_zero_and_only_preference_counts_AC5() -> None:
    alpha, beta = effective_weights(0.6, 0.4, has_model=True, has_face=False)
    catalog = _catalog(_product("r1", "ROUND"), _product("r2", "ROUND"), _product("s2", "SQUARE"))

    ranked = rank(
        catalog,
        ["r2", "s2"],
        [_event("u1", "r1")],
        F.ProductStats(),
        NOW,
        (_ShapeAffinityBooster(), _CARD),
        None,
        alpha,
        beta,
    )

    assert (alpha, beta) == (0.6, 0.0)
    assert [item.face_fit for item in ranked] == [0.0, 0.0]
    assert [item.final for item in ranked] == pytest.approx([0.6 * item.preference for item in ranked])
    assert ranked[0].product_id == "r2"


def test_cold_start_preference_is_normalized_popularity_and_fills_the_limit_AC6() -> None:
    catalog = _catalog(
        _product("p1", "ROUND"), _product("p2", "SQUARE"), _product("p3", "OVAL"), _product("p4", "CAT_EYE")
    )
    stats = F.ProductStats()
    for event in [_event("other", "p1")] * 3 + [_event("other", "p2")]:
        stats.add(event)

    ranked = rank(catalog, list(catalog), [], stats, NOW, (_UnusedBooster(), _CARD), None, 0.6, 0.0)
    top = diversify(ranked, catalog, limit=4, max_per_frame_shape=3, max_per_brand=3)

    preference = {item.product_id: item.preference for item in ranked}
    # Average rank for the tie (p3, p4 have no events), scaled by n-1.
    assert preference == pytest.approx({"p1": 1.0, "p2": 2 / 3, "p3": 0.5 / 3, "p4": 0.5 / 3})
    assert [item.product_id for item in top][:2] == ["p1", "p2"]
    assert len(top) == 4
    assert "Được nhiều người mua" in ranked[0].reasons


def _scored(pid: str, final: float) -> ScoredProduct:
    return ScoredProduct(pid, final, 0.0, final, 0.0, ())


def test_diversify_caps_top_10_at_3_per_frame_shape_and_3_per_brand_AC9() -> None:
    # 6 high-scoring ROUND frames of brand A, then one product per other shape/brand.
    others = ["SQUARE", "OVAL", "CAT_EYE", "AVIATOR", "RECTANGLE", "WAYFARER", "RIMLESS"]
    catalog = _catalog(
        *[_product(f"a{i}", "ROUND", brand="A") for i in range(6)],
        *[_product(f"o{i}", shape, brand=f"B{i}") for i, shape in enumerate(others)],
        _product("a-sq", "SQUARE", brand="A"),
    )
    ranked = [_scored(f"a{i}", 0.9 - i * 0.01) for i in range(6)]
    ranked += [_scored("a-sq", 0.8)]
    ranked += [_scored(f"o{i}", 0.5 - i * 0.01) for i in range(len(others))]

    top = diversify(ranked, catalog, limit=10, max_per_frame_shape=3, max_per_brand=3)

    ids = [item.product_id for item in top]
    assert len(ids) == 10
    assert ids[:3] == ["a0", "a1", "a2"]  # score order inside the caps
    assert "a-sq" not in ids  # brand A already has 3
    shapes = [catalog[pid].frame_shape for pid in ids]
    brands = [catalog[pid].brand for pid in ids]
    assert max(shapes.count(s) for s in set(shapes)) <= 3
    assert max(brands.count(b) for b in set(brands)) <= 3

