"""Hybrid ranking: `final = α·PreferenceScore + β·FaceFitScore`, diversity re-rank, reasons.

Pure functions over plain inputs (no FastAPI, no I/O) so the offline evaluation (plan 12)
can reuse the same math. The caller (`RecommendationService`) fetches the catalog, the
events and the face analysis, and passes the effective weights (`effective_weights`).

- Features come only from `app.ml.features` and scores from `app.ml.preference` — the same
  code training used. The user profile and cross features always get the FULL catalog
  (purchases and request filters only remove candidates), like `build_dataset.py`.
- Cold start (`profile.has_history == 0`) or legacy mode (no model) → preference =
  `pop_norm`, the rank-normalized decayed popularity over the full catalog.
- FaceFit is added after inference, never a model input (roadmap C5).
"""
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

import numpy as np

from app.core.model_registry import PreferenceModel
from app.ml import features as F
from app.ml.face_fit import face_fit
from app.ml.preference import predict_preference
from app.schemas.recommend import FaceShape

# Reason thresholds (see `_reasons`).
REASON_FACE_FIT_MIN = 0.8
REASON_SHAPE_COS_MIN = 0.5
REASON_BRAND_AFFINITY_MIN = 0.3
REASON_PRICE_ABS_Z_MAX = 1.0
REASON_POPULAR_POP_NORM_MIN = 0.8  # top 20% of the catalog by popularity
MAX_REASONS = 2

# Diversity caps apply to this many first positions only.
DIVERSITY_TOP_N = 10

# Copy of the face-shape labels of `web/src/lib/labels.ts` (FACE_SHAPE_LABELS_VI).
FACE_SHAPE_LABELS_VI: dict[FaceShape, str] = {
    FaceShape.OVAL: "Oval",
    FaceShape.ROUND: "Tròn",
    FaceShape.SQUARE: "Vuông",
    FaceShape.HEART: "Tim",
    FaceShape.DIAMOND: "Kim cương",
    FaceShape.OBLONG: "Dài",
}


@dataclass(frozen=True)
class FaceInput:
    """Face-shape probabilities of one analysis (one-hot when only the label is known)
    plus its top-1 `face_shape` (used in the reason text)."""

    probabilities: Mapping[FaceShape, float]
    face_shape: FaceShape


@dataclass(frozen=True)
class ScoredProduct:
    product_id: str
    preference: float
    face_fit: float
    final: float
    pop_norm: float
    reasons: tuple[str, ...]


def effective_weights(
    alpha: float, beta: float, has_model: bool, has_face: bool
) -> tuple[float, float]:
    """(α, β) actually used: α=0 in legacy mode (no model), β=0 without a face analysis."""
    return (alpha if has_model else 0.0, beta if has_face else 0.0)


def popularity_scores(
    catalog: Mapping[str, F.Product], stats: F.ProductStats, now: datetime
) -> tuple[dict[str, float], dict[str, float]]:
    """(decayed popularity, pop_norm) per catalog product. `pop_norm` is the rank of the
    popularity scaled to [0, 1] (average rank for ties); all popularities 0 → all 0."""
    ids = list(catalog)
    popularity = {pid: stats.snapshot(pid, now)[0] for pid in ids}
    n = len(ids)
    values = np.array([popularity[pid] for pid in ids], dtype=np.float64)
    if n == 0 or not np.any(values > 0):
        return popularity, {pid: 0.0 for pid in ids}
    if n == 1:
        return popularity, {ids[0]: 1.0}

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
    norm = ranks / (n - 1)
    return popularity, {pid: float(norm[i]) for i, pid in enumerate(ids)}


def _reasons(
    face: FaceInput | None,
    fit: float,
    cross: F.CrossFeatures,
    profile: F.UserProfile,
    popularity: float,
    pop_norm: float,
) -> tuple[str, ...]:
    """Vietnamese reasons in priority order, at most `MAX_REASONS`."""
    reasons: list[str] = []
    if face is not None and fit >= REASON_FACE_FIT_MIN:
        reasons.append(f"Hợp dáng mặt {FACE_SHAPE_LABELS_VI[face.face_shape]}")
    if cross.cos_shape >= REASON_SHAPE_COS_MIN:
        reasons.append("Giống kiểu gọng bạn hay xem")
    if cross.brand_affinity >= REASON_BRAND_AFFINITY_MIN:
        reasons.append("Thương hiệu bạn yêu thích")
    if profile.has_history and cross.price_abs_z < REASON_PRICE_ABS_Z_MAX:
        reasons.append("Trong khoảng giá bạn quan tâm")
    if popularity > 0 and pop_norm >= REASON_POPULAR_POP_NORM_MIN:
        reasons.append("Được nhiều người mua")
    return tuple(reasons[:MAX_REASONS])


def rank(
    catalog: Mapping[str, F.Product],
    candidate_ids: Sequence[str],
    user_events: Sequence[F.Event],
    stats: F.ProductStats,
    now: datetime,
    model: PreferenceModel | None,
    face: FaceInput | None,
    alpha: float,
    beta: float,
) -> list[ScoredProduct]:
    """Score `candidate_ids` (all keys of `catalog`) and sort by `final` desc, ties by
    `pop_norm` desc, then by candidate order. `alpha`/`beta` are the effective weights."""
    if not candidate_ids:
        return []

    profile = F.build_user_profile(user_events, catalog, now)
    popularity, pop_norm = popularity_scores(catalog, stats, now)
    products = [catalog[pid] for pid in candidate_ids]
    crosses = [F.build_cross_features(profile, product) for product in products]

    if model is not None and profile.has_history:
        booster, card = model
        rows = [
            F.vectorize(
                profile,
                F.build_product_features(
                    product,
                    stats.snapshot(product.product_id, now),
                    card["price_band_edges"],
                    now,
                ),
                cross,
            )[0]
            for product, cross in zip(products, crosses)
        ]
        preferences = predict_preference(booster, card["calibration"], np.stack(rows)).tolist()
    else:
        preferences = [pop_norm[pid] for pid in candidate_ids]

    scored: list[ScoredProduct] = []
    for product, cross, preference in zip(products, crosses, preferences):
        pid = product.product_id
        fit = face_fit(face.probabilities, product.frame_shape) if face is not None else 0.0
        scored.append(
            ScoredProduct(
                product_id=pid,
                preference=float(preference),
                face_fit=fit,
                final=alpha * float(preference) + beta * fit,
                pop_norm=pop_norm[pid],
                reasons=_reasons(face, fit, cross, profile, popularity[pid], pop_norm[pid]),
            )
        )
    # `sort` is stable, so equal keys keep the candidate order.
    scored.sort(key=lambda item: (item.final, item.pop_norm), reverse=True)
    return scored


def diversify(
    ranked: Sequence[ScoredProduct],
    catalog: Mapping[str, F.Product],
    limit: int,
    max_per_frame_shape: int,
    max_per_brand: int,
    top_n: int = DIVERSITY_TOP_N,
) -> list[ScoredProduct]:
    """Greedy re-rank: among the first `top_n` picks, at most `max_per_frame_shape` per
    frame shape and `max_per_brand` per brand. The rest (positions after `top_n`, or
    fill-up when the caps leave too few items) follows plain score order."""
    picked: list[ScoredProduct] = []
    picked_ids: set[str] = set()
    shape_counts: dict[str, int] = defaultdict(int)
    brand_counts: dict[str, int] = defaultdict(int)
    capped = min(top_n, limit)
    for item in ranked:
        if len(picked) >= capped:
            break
        product = catalog[item.product_id]
        if (
            shape_counts[product.frame_shape] >= max_per_frame_shape
            or brand_counts[product.brand] >= max_per_brand
        ):
            continue
        picked.append(item)
        picked_ids.add(item.product_id)
        shape_counts[product.frame_shape] += 1
        brand_counts[product.brand] += 1

    rest = [item for item in ranked if item.product_id not in picked_ids]
    return picked + rest[: max(0, limit - len(picked))]
