"""Unit tests for `AdminService` (plan 15) — model info, daily events, funnel, top products
and the `from`/`to` range rules.

Boundaries are small fakes: interaction repository (the 3 admin aggregates) and product
client (`list_catalog`). No DB, no network, no committed model. Explicit `from`/`to` dates
keep every test independent of today's date.
"""
import asyncio
from datetime import date, datetime, time
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest

from app.core.config import Settings
from app.db.models import BehaviorEventType
from app.repositories.product_client import ProductServiceUnavailableError
from app.schemas.recommend import BrandSummaryDto, CatalogProductDto, ProductImageDto
from app.services.admin_service import AdminService, InvalidDateRangeError

VN = ZoneInfo("Asia/Ho_Chi_Minh")
P_KNOWN = UUID("00000000-0000-0000-0000-00000000000a")
P_UNKNOWN = UUID("00000000-0000-0000-0000-00000000000b")

_SETTINGS = Settings(
    RANK_ALPHA=0.7,
    RANK_BETA=0.3,
    PREFERENCE_NORM="rank",
    PREFERENCE_MODEL_VERSION="",
)


class FakeInteractionRepository:
    def __init__(self, daily=(), users=None, top=()):
        self._daily = list(daily)
        self._users = users or {}
        self._top = list(top)
        self.calls: list[tuple] = []

    async def daily_counts(self, start, end, source):
        self.calls.append(("daily_counts", start, end, source))
        return self._daily

    async def distinct_users_by_type(self, start, end, source):
        self.calls.append(("distinct_users_by_type", start, end, source))
        return self._users

    async def top_products(self, event_type, start, end, source, limit):
        self.calls.append(("top_products", event_type, start, end, source, limit))
        return self._top


class FakeProductClient:
    def __init__(self, products=(), error: Exception | None = None):
        self._products = list(products)
        self._error = error

    async def list_catalog(self):
        if self._error is not None:
            raise self._error
        return self._products


def _product(pid: UUID, images: list[ProductImageDto]) -> CatalogProductDto:
    return CatalogProductDto(
        id=str(pid),
        sku="SKU-A",
        name="Kính A",
        slug="kinh-a",
        frameShape="ROUND",
        genderTarget="UNISEX",
        basePrice=1_000_000.0,
        brand=BrandSummaryDto(id="brand-a", name="Brand A", logoUrl=None),
        images=images,
        faceShapes=[],
    )


def _image(url: str, is_thumbnail: bool) -> ProductImageDto:
    return ProductImageDto(
        id=url, variantId=None, imageUrl=url, isThumbnail=is_thumbnail, sortOrder=0
    )


def _service(repository=None, client=None, model=None) -> AdminService:
    return AdminService(
        repository or FakeInteractionRepository(),
        client or FakeProductClient(),
        _SETTINGS,
        model,
    )


def test_model_info_in_legacy_mode_is_not_loaded_but_has_weights_ac3() -> None:
    info = _service(model=None).model_info()

    assert info.model_dump() == {
        "loaded": False,
        "version": None,
        "algorithm": None,
        "objective": None,
        "createdAt": None,
        "metrics": None,
        "alpha": 0.7,
        "beta": 0.3,
        "preferenceNorm": "rank",
    }


def test_model_info_reads_card_and_test_metrics_ac2() -> None:
    card = {
        "version": "v-test",
        "algorithm": "xgboost",
        "objective": "rank:ndcg",
        "created_at": "2026-09-01T00:00:00Z",
        "metrics": {
            "test": {
                "ndcg@10": {"mean": 0.42},
                "hitrate@10": {"mean": 0.8},
                "precision@10": {"mean": 0.1},
                # recall@10 missing → null
            }
        },
    }

    info = _service(model=(object(), card)).model_info()

    assert info.loaded is True
    assert (info.version, info.algorithm, info.objective, info.createdAt) == (
        "v-test",
        "xgboost",
        "rank:ndcg",
        "2026-09-01T00:00:00Z",
    )
    assert info.metrics.model_dump() == {
        "ndcgAt10": 0.42,
        "hitRateAt10": 0.8,
        "precisionAt10": 0.1,
        "recallAt10": None,
    }
    assert (info.alpha, info.beta, info.preferenceNorm) == (0.7, 0.3, "rank")


def test_daily_events_zero_fills_every_day_and_funnel_type_ac4_ac10() -> None:
    repository = FakeInteractionRepository(
        daily=[
            (date(2026, 9, 2), BehaviorEventType.VIEW, 5),
            (date(2026, 9, 2), BehaviorEventType.UNLIKE, 9),  # not a funnel type → dropped
        ]
    )

    result = asyncio.run(
        _service(repository).daily_events(date(2026, 9, 1), date(2026, 9, 3), "real")
    )

    zeros = {"VIEW": 0, "TRY_ON": 0, "LIKE": 0, "ADD_TO_CART": 0, "PURCHASE": 0}
    assert (result.date_from, result.date_to, result.source) == (
        date(2026, 9, 1),
        date(2026, 9, 3),
        "real",
    )
    assert [(day.date, day.counts) for day in result.days] == [
        (date(2026, 9, 1), zeros),
        (date(2026, 9, 2), {**zeros, "VIEW": 5}),
        (date(2026, 9, 3), zeros),
    ]
    # Window = [start of `from`, start of `to` + 1 day) in Vietnam time.
    assert repository.calls == [
        (
            "daily_counts",
            datetime.combine(date(2026, 9, 1), time.min, tzinfo=VN),
            datetime.combine(date(2026, 9, 4), time.min, tzinfo=VN),
            "real",
        )
    ]


def test_funnel_builds_five_steps_with_conversion_and_null_after_zero_ac5() -> None:
    repository = FakeInteractionRepository(
        users={
            BehaviorEventType.VIEW: 10,
            BehaviorEventType.TRY_ON: 4,
            # LIKE absent → 0
            BehaviorEventType.ADD_TO_CART: 2,
            BehaviorEventType.PURCHASE: 1,
        }
    )

    result = asyncio.run(
        _service(repository).funnel(date(2026, 9, 1), date(2026, 9, 30), "all")
    )

    assert [
        (step.eventType, step.users, step.conversionFromPrevious) for step in result.steps
    ] == [
        ("VIEW", 10, None),
        ("TRY_ON", 4, 0.4),
        ("LIKE", 0, 0.0),
        ("ADD_TO_CART", 2, None),  # previous step is 0
        ("PURCHASE", 1, 0.5),
    ]
    assert result.source == "all"


def test_top_products_enriches_from_catalog_and_nulls_unknown_product_ac6() -> None:
    repository = FakeInteractionRepository(top=[(P_KNOWN, 7), (P_UNKNOWN, 3)])
    client = FakeProductClient(
        [_product(P_KNOWN, [_image("gallery.jpg", False), _image("thumb.jpg", True)])]
    )

    result = asyncio.run(
        _service(repository, client).top_products(
            "TRY_ON", date(2026, 9, 1), date(2026, 9, 30), "simulator", 10
        )
    )

    assert result.eventType == "TRY_ON"
    assert [item.model_dump() for item in result.items] == [
        {
            "productId": str(P_KNOWN),
            "count": 7,
            "name": "Kính A",
            "slug": "kinh-a",
            "thumbnailUrl": "thumb.jpg",
        },
        {
            "productId": str(P_UNKNOWN),
            "count": 3,
            "name": None,
            "slug": None,
            "thumbnailUrl": None,
        },
    ]
    assert repository.calls[0][0] == "top_products"
    assert repository.calls[0][1] == BehaviorEventType.TRY_ON
    assert repository.calls[0][4:] == ("simulator", 10)


def test_top_products_when_catalog_unavailable_returns_items_without_names_ac6() -> None:
    repository = FakeInteractionRepository(top=[(P_KNOWN, 7)])
    client = FakeProductClient(error=ProductServiceUnavailableError("down"))

    result = asyncio.run(
        _service(repository, client).top_products(
            "VIEW", date(2026, 9, 1), date(2026, 9, 30), "real", 10
        )
    )

    assert [item.model_dump() for item in result.items] == [
        {
            "productId": str(P_KNOWN),
            "count": 7,
            "name": None,
            "slug": None,
            "thumbnailUrl": None,
        }
    ]


@pytest.mark.parametrize(
    ("date_from", "date_to", "message"),
    [
        (date(2026, 9, 2), date(2026, 9, 1), "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc"),
        (date(2026, 6, 1), date(2026, 8, 30), "Khoảng thời gian tối đa là 90 ngày"),  # 91 days
    ],
    ids=["from-after-to", "over-90-days"],
)
def test_invalid_range_raises_with_vietnamese_message_ac11(date_from, date_to, message) -> None:
    repository = FakeInteractionRepository()

    with pytest.raises(InvalidDateRangeError) as exc_info:
        asyncio.run(_service(repository).daily_events(date_from, date_to, "real"))

    assert str(exc_info.value) == message
    assert repository.calls == []
