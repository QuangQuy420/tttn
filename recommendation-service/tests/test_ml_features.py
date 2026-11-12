"""Unit tests for the ranker feature engineering (`app.ml.features`) — pure functions,
no mocks. Expected values are computed by hand from the plan's Design section
(`.planning/2026-09-29-09-recsys-behavior-dataset.md`, "Feature engineering"), not
read back from the code.

Toy catalog: p1 (brand A, ROUND, METAL, 2 colors, 100) and p2 (brand B, SQUARE, null
material, 1 color, 300).
"""
import math
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from app.ml.features import (
    EVENT_LABELS,
    EVENT_WEIGHTS,
    POSITIVE_TYPES,
    TAU_DAYS,
    Event,
    Product,
    ProductStats,
    build_cross_features,
    build_product_features,
    build_user_profile,
    feature_names,
    price_band_edges,
    vectorize,
)

NOW = datetime(2026, 1, 15, tzinfo=timezone.utc)
USER = "u1"

P1 = Product("p1", "A", "ROUND", "METAL", "UNISEX", 100.0, ("black", "red"))
P2 = Product("p2", "B", "SQUARE", None, "MALE", 300.0, ("black",))
CATALOG = {"p1": P1, "p2": P2}

# Hand-computed decayed weights of the two events that survive in `_past_events()`.
W_VIEW_P1 = 1.0 * math.exp(-14 / 14)  # VIEW, 14 days ago
W_LIKE_P2 = 3.0 * math.exp(-3 / 14)  # LIKE, 3 days ago
W_TOTAL = W_VIEW_P1 + W_LIKE_P2


def _event(product_id: str, event_type: str, days_ago: float) -> Event:
    return Event(USER, product_id, event_type, NOW - timedelta(days=days_ago))


def _past_events() -> list[Event]:
    """VIEW p1 (-14d), LIKE p2 (-7d) undone by UNLIKE (-6d), LIKE p2 again (-3d)."""
    return [
        _event("p1", "VIEW", 14),
        _event("p2", "LIKE", 7),
        _event("p2", "UNLIKE", 6),
        _event("p2", "LIKE", 3),
    ]


def test_event_weights_labels_and_decay_follow_c4_table_ac8() -> None:
    assert EVENT_WEIGHTS == {
        "VIEW": 1.0,
        "TRY_ON": 2.0,
        "LIKE": 3.0,
        "ADD_TO_CART": 4.0,
        "PURCHASE": 5.0,
        "UNLIKE": 0.0,
    }
    assert EVENT_LABELS == {"VIEW": 1, "TRY_ON": 2, "LIKE": 2, "ADD_TO_CART": 3, "PURCHASE": 4}
    assert TAU_DAYS == 14
    assert POSITIVE_TYPES == ("VIEW", "TRY_ON", "LIKE", "ADD_TO_CART", "PURCHASE")


def test_user_profile_decays_weights_and_unlike_cancels_earlier_like_ac8() -> None:
    profile = build_user_profile(_past_events(), CATALOG, NOW)

    shapes = dict(zip(["ROUND", "SQUARE", "OVAL", "CAT_EYE", "AVIATOR", "RECTANGLE", "WAYFARER", "RIMLESS"], profile.shape_dist))
    assert shapes["ROUND"] == pytest.approx(W_VIEW_P1 / W_TOTAL)
    assert shapes["SQUARE"] == pytest.approx(W_LIKE_P2 / W_TOTAL)
    assert sum(shapes.values()) == pytest.approx(1.0)
    # p2 has a null material -> adds nothing; only p1 (METAL, index 1) counts.
    assert profile.material_dist.tolist() == pytest.approx([0, 1, 0, 0, 0, 0])
    # p1 splits its weight over 2 colors; p2 gives all of it to black.
    assert profile.color_dist == pytest.approx(
        {"black": (W_VIEW_P1 / 2 + W_LIKE_P2) / W_TOTAL, "red": (W_VIEW_P1 / 2) / W_TOTAL}
    )
    assert profile.brand_dist == pytest.approx({"A": W_VIEW_P1 / W_TOTAL, "B": W_LIKE_P2 / W_TOTAL})
    assert profile.price_mean == pytest.approx((100 * W_VIEW_P1 + 300 * W_LIKE_P2) / W_TOTAL)

    # counts are type-major over windows 7d / 30d / all; the cancelled LIKE is gone.
    counts = profile.counts.reshape(5, 3)
    assert counts[0].tolist() == [0, 1, 1]  # VIEW at 14 days: not < 7
    assert counts[2].tolist() == [1, 1, 1]  # one LIKE left, 3 days ago
    assert counts[[1, 3, 4]].sum() == 0
    assert profile.days_since_last == pytest.approx(3.0)
    assert profile.n_products == 2
    assert profile.has_history == 1
    assert profile.brand_event_counts == {"A": 1, "B": 1}


def test_events_at_or_after_now_are_ignored_ac11() -> None:
    future = [
        _event("p1", "PURCHASE", 0),  # exactly at `now`
        _event("p2", "UNLIKE", -1),  # a later UNLIKE must not hide the LIKE at -3d
        _event("p1", "ADD_TO_CART", -2),
    ]
    with_future = build_user_profile(_past_events() + future, CATALOG, NOW)
    without = build_user_profile(_past_events(), CATALOG, NOW)

    assert with_future.shape_dist.tolist() == pytest.approx(without.shape_dist.tolist())
    assert with_future.counts.tolist() == without.counts.tolist()
    assert with_future.brand_dist == pytest.approx(without.brand_dist)
    assert with_future.price_mean == pytest.approx(without.price_mean)
    assert with_future.days_since_last == pytest.approx(3.0)

    only_future = build_user_profile(future, CATALOG, NOW)
    assert only_future.has_history == 0
    assert only_future.days_since_last == -1
    assert not only_future.shape_dist.any()
    assert only_future.price_mean == 0 and only_future.price_std == 0


def test_product_stats_future_dated_event_decays_at_most_one_AC55() -> None:
    stats = ProductStats()
    stats.add(Event(USER, "p1", "PURCHASE", NOW + timedelta(days=30)))

    popularity, _, n_purchase, _ = stats.snapshot("p1", NOW)

    # Age clamped at 0 → weight × exp(0), never more than the event's own weight.
    assert popularity == pytest.approx(EVENT_WEIGHTS["PURCHASE"])
    assert n_purchase == 1


def test_cross_features_cosine_affinities_and_price_z_on_toy_catalog() -> None:
    profile = build_user_profile(_past_events(), CATALOG, NOW)
    mean = (100 * W_VIEW_P1 + 300 * W_LIKE_P2) / W_TOTAL
    std = math.sqrt((W_VIEW_P1 * (100 - mean) ** 2 + W_LIKE_P2 * (300 - mean) ** 2) / W_TOTAL)
    expected_z = (100 - mean) / max(std, 0.1 * mean)

    cross = build_cross_features(profile, P1)

    shape_a, shape_b = W_VIEW_P1 / W_TOTAL, W_LIKE_P2 / W_TOTAL
    assert cross.cos_shape == pytest.approx(shape_a / math.hypot(shape_a, shape_b))
    assert cross.cos_material == pytest.approx(1.0)
    color = profile.color_dist
    assert cross.color_affinity == pytest.approx((color["black"] + color["red"]) / 2)
    assert cross.brand_affinity == pytest.approx(shape_a)
    assert cross.price_z == pytest.approx(expected_z)
    assert cross.price_abs_z == pytest.approx(abs(expected_z))
    assert cross.brand_events == 1
    # null material on p2 -> product vector all zero -> cosine 0
    assert build_cross_features(profile, P2).cos_material == 0.0


def test_vectorize_has_63_named_values_and_no_face_feature_ac12() -> None:
    profile = build_user_profile(_past_events(), CATALOG, NOW)
    stats = ProductStats()
    stats.add(_event("p1", "VIEW", 10))
    stats.add(_event("p1", "PURCHASE", 5))
    product = build_product_features(P1, stats.snapshot("p1", NOW), price_band_edges(CATALOG), NOW)
    cross = build_cross_features(profile, P1)

    vector, names = vectorize(profile, product, cross)

    assert vector.dtype == np.float32
    assert len(vector) == len(names) == len(feature_names()) == 63
    assert names == feature_names()
    assert not [name for name in names if "face" in name.lower()]
    assert "context" not in Event.__dataclass_fields__

    row = dict(zip(names, vector.tolist()))
    assert row["u_has_history"] == 1
    assert row["p_shape_ROUND"] == 1 and row["p_material_METAL"] == 1 and row["p_gender_UNISEX"] == 1
    assert row["p_price_band"] == 0  # quartile edges of [100, 300] are 150/200/250
    assert row["p_log_pop"] == pytest.approx(
        math.log1p(math.exp(-10 / 14) + 5 * math.exp(-5 / 14)), rel=1e-6
    )
    assert row["p_purchase_rate"] == 1
    assert row["p_age_days"] == pytest.approx(10.0)


def test_price_band_edges_rejects_empty_catalog() -> None:
    with pytest.raises(ValueError):
        price_band_edges({})
