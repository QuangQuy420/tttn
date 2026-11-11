"""Feature engineering for the personalized ranker (AI 2 / PreferenceScore).

The single source of feature code for training (`ml/recommendation`, imported through
`PYTHONPATH`) AND serving (this service, at request time) — so both compute exactly the
same vector. Pure functions over plain dataclasses: no FastAPI, no DB, no pandas, no
settings.

Leakage rules (the caller decides `now`):
- `build_user_profile` only uses events strictly before `now` (training: the row's `ts`;
  serving: the request time).
- `ProductStats.snapshot` must be taken before the events at `ts` are added.
- `Event` has no `context`, so `context.faceShape` can never reach a feature. No feature
  is derived from the face-shape model (AI 1); no feature name contains "face".

Weights / labels / decay follow the thesis roadmap C4 (`EVENT_WEIGHTS`, `EVENT_LABELS`,
`TAU_DAYS`).
"""
import math
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np

from app.schemas.recommend import FrameShape, GenderTarget

FEATURE_SCHEMA_VERSION = "rec-v1"

VIEW = "VIEW"
TRY_ON = "TRY_ON"
LIKE = "LIKE"
UNLIKE = "UNLIKE"
ADD_TO_CART = "ADD_TO_CART"
PURCHASE = "PURCHASE"

EVENT_WEIGHTS: dict[str, float] = {
    VIEW: 1.0,
    TRY_ON: 2.0,
    LIKE: 3.0,
    ADD_TO_CART: 4.0,
    PURCHASE: 5.0,
    UNLIKE: 0.0,
}
EVENT_LABELS: dict[str, int] = {
    VIEW: 1,
    TRY_ON: 2,
    LIKE: 2,
    ADD_TO_CART: 3,
    PURCHASE: 4,
}
TAU_DAYS = 14.0
POSITIVE_TYPES: tuple[str, ...] = (VIEW, TRY_ON, LIKE, ADD_TO_CART, PURCHASE)

FRAME_SHAPES: tuple[str, ...] = tuple(shape.value for shape in FrameShape)
GENDER_TARGETS: tuple[str, ...] = tuple(gender.value for gender in GenderTarget)
# Mirrors product-service/src/db/enums/material-type.enum.ts (same values, same order).
MATERIAL_TYPES: tuple[str, ...] = ("ACETATE", "METAL", "TITANIUM", "TR90", "PLASTIC", "MIXED")
N_PRICE_BANDS = 4

COUNT_WINDOWS: tuple[tuple[str, float], ...] = (("7d", 7.0), ("30d", 30.0), ("all", math.inf))

_SECONDS_PER_DAY = 86400.0
_SHAPE_INDEX = {value: i for i, value in enumerate(FRAME_SHAPES)}
_MATERIAL_INDEX = {value: i for i, value in enumerate(MATERIAL_TYPES)}
_GENDER_INDEX = {value: i for i, value in enumerate(GENDER_TARGETS)}


@dataclass(frozen=True)
class Event:
    user_id: str
    product_id: str
    event_type: str
    occurred_at: datetime  # UTC-aware


@dataclass(frozen=True)
class Product:
    product_id: str
    brand: str
    frame_shape: str
    material_type: str | None
    gender_target: str
    base_price: float
    colors: tuple[str, ...]  # sorted distinct variant colors; de-duplicated again here


@dataclass(frozen=True)
class UserProfile:
    shape_dist: np.ndarray  # (8,) over FRAME_SHAPES, sums to 1 (or all 0)
    material_dist: np.ndarray  # (6,) over MATERIAL_TYPES, sums to 1 (or all 0)
    color_dist: dict[str, float]
    brand_dist: dict[str, float]
    price_mean: float
    price_std: float
    counts: np.ndarray  # (15,) POSITIVE_TYPES x COUNT_WINDOWS, type-major
    days_since_last: float  # -1 without history
    n_products: int
    has_history: int  # 0 | 1
    brand_event_counts: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class ProductFeatures:
    shape_onehot: np.ndarray  # (8,)
    material_onehot: np.ndarray  # (6,), all 0 for a null material
    gender_onehot: np.ndarray  # (3,)
    price: float
    price_band: int  # 0..N_PRICE_BANDS-1
    log_pop: float
    purchase_rate: float
    age_days: float


@dataclass(frozen=True)
class CrossFeatures:
    cos_shape: float
    cos_material: float
    color_affinity: float
    brand_affinity: float
    price_z: float
    price_abs_z: float
    brand_events: float


def _days_between(now: datetime, then: datetime) -> float:
    return (now - then).total_seconds() / _SECONDS_PER_DAY


def _index_of(index: Mapping[str, int], value: str, what: str) -> int:
    try:
        return index[value]
    except KeyError:
        raise ValueError(f"unknown {what}: {value!r}") from None


def _onehot(size: int, position: int | None) -> np.ndarray:
    vector = np.zeros(size, dtype=np.float64)
    if position is not None:
        vector[position] = 1.0
    return vector


def _normalized(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        return {}
    return {key: value / total for key, value in weights.items()}


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    norm = float(np.linalg.norm(a) * np.linalg.norm(b))
    if norm == 0.0:
        return 0.0
    return float(np.dot(a, b) / norm)


def apply_unlike_cancellation(events: Iterable[Event]) -> list[Event]:
    """Drop every UNLIKE together with the latest earlier LIKE of the same (user, product).

    Events are ordered by `occurred_at`; on a tie a LIKE comes before an UNLIKE. An UNLIKE
    with no earlier LIKE is just dropped. Returns the remaining events in that order.
    Callers pass only events before `t`, so a later UNLIKE never hides a LIKE at `t`.
    """
    ordered = sorted(events, key=lambda e: (e.occurred_at, e.event_type == UNLIKE))
    removed: set[int] = set()
    open_likes: dict[tuple[str, str], list[int]] = defaultdict(list)
    for i, event in enumerate(ordered):
        key = (event.user_id, event.product_id)
        if event.event_type == LIKE:
            open_likes[key].append(i)
        elif event.event_type == UNLIKE:
            removed.add(i)
            if open_likes[key]:
                removed.add(open_likes[key].pop())
    return [event for i, event in enumerate(ordered) if i not in removed]


def build_user_profile(
    events_before_t: Iterable[Event], catalog: Mapping[str, Product], now: datetime
) -> UserProfile:
    """Decay-weighted taste profile of one user from their events before `now`."""
    past = [e for e in events_before_t if e.occurred_at < now]
    kept = [e for e in apply_unlike_cancellation(past) if e.product_id in catalog]

    if not kept:
        return UserProfile(
            shape_dist=np.zeros(len(FRAME_SHAPES)),
            material_dist=np.zeros(len(MATERIAL_TYPES)),
            color_dist={},
            brand_dist={},
            price_mean=0.0,
            price_std=0.0,
            counts=np.zeros(len(POSITIVE_TYPES) * len(COUNT_WINDOWS)),
            days_since_last=-1.0,
            n_products=0,
            has_history=0,
        )

    products = [catalog[e.product_id] for e in kept]
    dt = np.array([_days_between(now, e.occurred_at) for e in kept])
    weights = np.array([EVENT_WEIGHTS[e.event_type] for e in kept])
    decayed = weights * np.exp(-dt / TAU_DAYS)

    shape_idx = np.array([_index_of(_SHAPE_INDEX, p.frame_shape, "frame_shape") for p in products])
    shape_raw = np.bincount(shape_idx, weights=decayed, minlength=len(FRAME_SHAPES))

    material_raw = np.zeros(len(MATERIAL_TYPES))
    color_raw: dict[str, float] = defaultdict(float)
    brand_raw: dict[str, float] = defaultdict(float)
    brand_event_counts: dict[str, int] = defaultdict(int)
    for product, weight in zip(products, decayed.tolist()):
        if product.material_type is not None:
            material_raw[_index_of(_MATERIAL_INDEX, product.material_type, "material_type")] += weight
        colors = sorted(set(product.colors))
        for color in colors:
            color_raw[color] += weight / len(colors)
        brand_raw[product.brand] += weight
        brand_event_counts[product.brand] += 1

    shape_total = shape_raw.sum()
    material_total = material_raw.sum()

    prices = np.array([float(p.base_price) for p in products])
    weight_sum = decayed.sum()
    if weight_sum > 0:
        price_mean = float(np.dot(decayed, prices) / weight_sum)
        price_std = float(np.sqrt(np.dot(decayed, (prices - price_mean) ** 2) / weight_sum))
    else:
        price_mean = price_std = 0.0

    types = np.array([e.event_type for e in kept])
    counts = np.array(
        [
            float(np.count_nonzero((types == event_type) & (dt < limit)))
            for event_type in POSITIVE_TYPES
            for _, limit in COUNT_WINDOWS
        ]
    )

    return UserProfile(
        shape_dist=shape_raw / shape_total if shape_total > 0 else np.zeros(len(FRAME_SHAPES)),
        material_dist=(
            material_raw / material_total if material_total > 0 else np.zeros(len(MATERIAL_TYPES))
        ),
        color_dist=_normalized(color_raw),
        brand_dist=_normalized(brand_raw),
        price_mean=price_mean,
        price_std=price_std,
        counts=counts,
        days_since_last=float(dt.min()),
        n_products=len({e.product_id for e in kept}),
        has_history=1,
        brand_event_counts=dict(brand_event_counts),
    )


class ProductStats:
    """Running per-product stats over all users' events, added in time order.

    Decayed popularity is kept incrementally as (value, reference time), so `snapshot`
    is O(1). UNLIKE adds weight 0 and does not take back the earlier LIKE.
    """

    def __init__(self) -> None:
        self._pop: dict[str, tuple[float, datetime]] = {}
        self._n_view: dict[str, int] = defaultdict(int)
        self._n_purchase: dict[str, int] = defaultdict(int)
        self._first_event_at: dict[str, datetime] = {}

    def add(self, event: Event) -> None:
        product_id = event.product_id
        weight = EVENT_WEIGHTS[event.event_type]
        previous = self._pop.get(product_id)
        if previous is None:
            self._pop[product_id] = (weight, event.occurred_at)
        else:
            value, at = previous
            decay = math.exp(-_days_between(event.occurred_at, at) / TAU_DAYS)
            self._pop[product_id] = (value * decay + weight, event.occurred_at)
        if event.event_type == VIEW:
            self._n_view[product_id] += 1
        elif event.event_type == PURCHASE:
            self._n_purchase[product_id] += 1
        first = self._first_event_at.get(product_id)
        if first is None or event.occurred_at < first:
            self._first_event_at[product_id] = event.occurred_at

    def set_totals(
        self, product_id: str, n_view: int, n_purchase: int, first_event_at: datetime
    ) -> None:
        """Overwrite the counters of `product_id` with all-time values (serving replays only
        a recent window with `add` but the counter features need the full history). Never
        add these on top of replayed counts."""
        self._n_view[product_id] = n_view
        self._n_purchase[product_id] = n_purchase
        self._first_event_at[product_id] = first_event_at

    def snapshot(self, product_id: str, now: datetime) -> tuple[float, int, int, datetime | None]:
        """(decayed_popularity, n_view, n_purchase, first_event_at | None) at `now`."""
        entry = self._pop.get(product_id)
        popularity = 0.0
        if entry is not None:
            value, at = entry
            # Clamped at 0: a future-dated event must not weigh more than a current one.
            popularity = value * math.exp(-max(0.0, _days_between(now, at)) / TAU_DAYS)
        return (
            popularity,
            self._n_view.get(product_id, 0),
            self._n_purchase.get(product_id, 0),
            self._first_event_at.get(product_id),
        )


def price_band_edges(catalog: Mapping[str, Product]) -> tuple[float, ...]:
    """Quartile edges (3 inner cut points) of the catalog's `base_price`."""
    if not catalog:
        raise ValueError("catalog is empty")
    prices = np.array([float(p.base_price) for p in catalog.values()])
    quantiles = np.linspace(0.0, 1.0, N_PRICE_BANDS + 1)[1:-1]
    return tuple(float(edge) for edge in np.quantile(prices, quantiles))


def build_product_features(
    product: Product,
    stats_snapshot: tuple[float, int, int, datetime | None],
    band_edges: Sequence[float],
    now: datetime,
) -> ProductFeatures:
    popularity, n_view, n_purchase, first_event_at = stats_snapshot
    material_position = (
        None
        if product.material_type is None
        else _index_of(_MATERIAL_INDEX, product.material_type, "material_type")
    )
    price = float(product.base_price)
    age_days = 0.0 if first_event_at is None else max(0.0, _days_between(now, first_event_at))
    return ProductFeatures(
        shape_onehot=_onehot(len(FRAME_SHAPES), _index_of(_SHAPE_INDEX, product.frame_shape, "frame_shape")),
        material_onehot=_onehot(len(MATERIAL_TYPES), material_position),
        gender_onehot=_onehot(
            len(GENDER_TARGETS), _index_of(_GENDER_INDEX, product.gender_target, "gender_target")
        ),
        price=price,
        price_band=int(np.searchsorted(np.asarray(band_edges, dtype=np.float64), price, side="right")),
        log_pop=float(np.log1p(max(0.0, popularity))),
        purchase_rate=min(1.0, n_purchase / n_view) if n_view > 0 else 0.0,
        age_days=age_days,
    )


def build_cross_features(profile: UserProfile, product: Product) -> CrossFeatures:
    shape_onehot = _onehot(len(FRAME_SHAPES), _index_of(_SHAPE_INDEX, product.frame_shape, "frame_shape"))
    material_onehot = _onehot(
        len(MATERIAL_TYPES),
        None
        if product.material_type is None
        else _index_of(_MATERIAL_INDEX, product.material_type, "material_type"),
    )
    colors = sorted(set(product.colors))
    color_affinity = (
        sum(profile.color_dist.get(color, 0.0) for color in colors) / len(colors) if colors else 0.0
    )

    price_z = 0.0
    if profile.has_history:
        scale = max(profile.price_std, 0.1 * profile.price_mean)
        if scale > 0:
            price_z = (float(product.base_price) - profile.price_mean) / scale

    return CrossFeatures(
        cos_shape=_cosine(profile.shape_dist, shape_onehot),
        cos_material=_cosine(profile.material_dist, material_onehot),
        color_affinity=float(color_affinity),
        brand_affinity=float(profile.brand_dist.get(product.brand, 0.0)),
        price_z=float(price_z),
        price_abs_z=float(abs(price_z)),
        brand_events=float(profile.brand_event_counts.get(product.brand, 0)),
    )


def feature_names() -> list[str]:
    """The 63 feature names, in the exact order of `vectorize`."""
    return (
        [f"u_shape_{shape}" for shape in FRAME_SHAPES]
        + [f"u_material_{material}" for material in MATERIAL_TYPES]
        + ["u_price_mean", "u_price_std"]
        + [f"u_cnt_{event_type}_{window}" for event_type in POSITIVE_TYPES for window, _ in COUNT_WINDOWS]
        + ["u_days_since_last", "u_n_products", "u_has_history"]
        + [f"p_shape_{shape}" for shape in FRAME_SHAPES]
        + [f"p_material_{material}" for material in MATERIAL_TYPES]
        + [f"p_gender_{gender}" for gender in GENDER_TARGETS]
        + ["p_price", "p_price_band", "p_log_pop", "p_purchase_rate", "p_age_days"]
        + [
            "x_cos_shape",
            "x_cos_material",
            "x_color_affinity",
            "x_brand_affinity",
            "x_price_z",
            "x_price_abs_z",
            "x_brand_events",
        ]
    )


def vectorize(
    profile: UserProfile, product_features: ProductFeatures, cross: CrossFeatures
) -> tuple[np.ndarray, list[str]]:
    """One float32 row (63 values) in `feature_names()` order, plus those names."""
    vector = np.concatenate(
        [
            profile.shape_dist,
            profile.material_dist,
            [profile.price_mean, profile.price_std],
            profile.counts,
            [profile.days_since_last, profile.n_products, profile.has_history],
            product_features.shape_onehot,
            product_features.material_onehot,
            product_features.gender_onehot,
            [
                product_features.price,
                product_features.price_band,
                product_features.log_pop,
                product_features.purchase_rate,
                product_features.age_days,
            ],
            [
                cross.cos_shape,
                cross.cos_material,
                cross.color_affinity,
                cross.brand_affinity,
                cross.price_z,
                cross.price_abs_z,
                cross.brand_events,
            ],
        ]
    ).astype(np.float32)
    names = feature_names()
    if vector.shape[0] != len(names):
        raise ValueError(f"feature vector has {vector.shape[0]} values, expected {len(names)}")
    return vector, names
