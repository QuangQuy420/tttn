"""Unit tests for `RecommendationService.recommend` — the face-shape -> ranked-products
use-case (T5). Uses a fake `IProductServiceClient` (the Protocol interface, per coder.md's
DI guidance) instead of a real httpx call, so these run without any network/product-service
dependency — mirrors face-processing-service's "no real model/photo needed" test style.
"""
import asyncio

import pytest

from app.repositories.product_client import (
    ProductServiceTimeoutError,
    ProductServiceUnavailableError,
)
from app.schemas.recommend import (
    BrandSummaryDto,
    FaceShape,
    FrameShape,
    RecommendedProductDto,
    RecommendRequest,
)
from app.services.recommendation_service import RecommendationService


def _product(product_id: str, frame_shape: FrameShape) -> RecommendedProductDto:
    return RecommendedProductDto(
        id=product_id,
        sku=f"SKU-{product_id}",
        name=f"Product {product_id}",
        slug=f"product-{product_id}",
        frameShape=frame_shape,
        basePrice=100.0,
        brand=BrandSummaryDto(id="brand-1", name="Brand", logoUrl=None),
        images=[],
        faceShapes=[FaceShape.OVAL],
        score=0.0,
    )


class FakeProductServiceClient:
    """A test double for `IProductServiceClient` — returns a fixed product list (optionally
    raising a domain error instead), recording the last call's arguments for assertions."""

    def __init__(self, products=None, error=None):
        self._products = products or []
        self._error = error
        self.last_call = None

    async def list_products(
        self,
        face_shape,
        frame_shape=None,
        gender_target=None,
        min_price=None,
        max_price=None,
        limit=None,
    ):
        self.last_call = {
            "face_shape": face_shape,
            "frame_shape": frame_shape,
            "gender_target": gender_target,
            "min_price": min_price,
            "max_price": max_price,
            "limit": limit,
        }
        if self._error is not None:
            raise self._error
        return self._products


def test_recommend_ranks_products_by_frame_shape_score_for_the_requested_face_shape() -> None:
    # For ROUND, the mapping scores SQUARE > RECTANGLE > CAT_EYE, so a mixed candidate pool
    # should come back re-ordered by that score, not in the order product-service returned them.
    products = [
        _product("a", FrameShape.CAT_EYE),
        _product("b", FrameShape.SQUARE),
        _product("c", FrameShape.RECTANGLE),
    ]
    client = FakeProductServiceClient(products=products)
    service = RecommendationService(client)

    response = asyncio.run(service.recommend(RecommendRequest(faceShape=FaceShape.ROUND)))

    assert [item.id for item in response.data] == ["b", "c", "a"]
    assert response.data[0].score > response.data[1].score > response.data[2].score


def test_recommend_paginates_the_ranked_list_by_page_and_limit() -> None:
    products = [
        _product("c", FrameShape.CAT_EYE),
        _product("a", FrameShape.SQUARE),
        _product("b", FrameShape.RECTANGLE),
    ]
    client = FakeProductServiceClient(products=products)
    service = RecommendationService(client)

    response = asyncio.run(
        service.recommend(RecommendRequest(faceShape=FaceShape.ROUND, page=2, limit=2))
    )

    # Ranked order is a, b, c -> page 2 of size 2 holds only c.
    assert [item.id for item in response.data] == ["c"]
    assert response.meta.model_dump() == {"page": 2, "limit": 2, "total": 3, "totalPages": 2}


def test_recommend_passes_optional_filters_through_to_the_product_client() -> None:
    client = FakeProductServiceClient(products=[])
    service = RecommendationService(client)

    asyncio.run(
        service.recommend(
            RecommendRequest(
                faceShape=FaceShape.OVAL,
                genderTarget="FEMALE",
                minPrice=50,
                maxPrice=500,
            )
        )
    )

    assert client.last_call["face_shape"] == "OVAL"
    assert client.last_call["gender_target"] == "FEMALE"
    assert client.last_call["min_price"] == 50
    assert client.last_call["max_price"] == 500


def test_recommend_always_fetches_the_full_candidate_pool_from_the_client() -> None:
    # The ranking pool must not shrink with the requested page size — product-service's
    # own default page size (20) would otherwise silently cap it before ranking.
    client = FakeProductServiceClient(products=[])
    service = RecommendationService(client)

    asyncio.run(service.recommend(RecommendRequest(faceShape=FaceShape.OVAL, limit=5)))

    assert client.last_call["limit"] == 100


@pytest.mark.parametrize(
    "error",
    [
        ProductServiceTimeoutError("product-service không phản hồi kịp thời."),
        ProductServiceUnavailableError("Không thể kết nối tới product-service."),
    ],
)
def test_recommend_propagates_product_service_errors_unchanged(error: Exception) -> None:
    # The service doesn't swallow/rewrap these — the router (T6) is what maps them to
    # 504/503 (AC6/NFR3), so propagating unchanged here is the correct behavior to test.
    client = FakeProductServiceClient(error=error)
    service = RecommendationService(client)

    with pytest.raises(type(error)):
        asyncio.run(service.recommend(RecommendRequest(faceShape=FaceShape.OVAL)))
