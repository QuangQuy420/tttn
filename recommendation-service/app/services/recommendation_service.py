"""Face-shape -> frame-shape ranking use-case for `POST /recommend`.

Design choice (plan T5 left this to the coding agent — documenting the choice here):
this service calls product-service's `GET /products?faceShape=...` **once** per
request (passing through the optional gender/price filters as extra query params so
product-service does that filtering server-side), then re-ranks the returned products
client-side using the T2 face-shape -> frame-shape score table, rather than issuing one
call per candidate frame shape.

Why: `GET /products?faceShape=X` already returns exactly the pool of products this
service is allowed to recommend for face shape X (every product whose `faceShapes`
includes that face shape), regardless of the product's own `frameShape`. Doing
N calls (one per candidate frame shape in the T2 mapping) would mean unioning many
paginated calls back together and would still miss/duplicate products whose tagged
face shape doesn't line up 1:1 with their own frame shape — needless complexity for no
extra correctness. A single call keeps this simple and avoids N network round-trips
against a downstream call that can already time out (NFR3); de-duping isn't needed
since a single page of results has no repeats.

Ranking: each returned product's own `frameShape` is looked up in the T2 table for the
requested `faceShape` to get its score (falls back to 0.0 if a product's frame shape
isn't in the table — shouldn't happen since the table covers all 8 `FrameShape`
values, but keeps this defensive rather than raising on unexpected data).
"""
from fastapi import Depends

from app.core.face_shape_mapping import get_ranked_frame_shapes
from app.repositories.product_client import (
    IProductServiceClient,
    get_product_service_client,
)
from app.schemas.common import ApiResponse, paginated
from app.schemas.recommend import RecommendedProductDto, RecommendRequest

# product-service's max `limit` per page — the ranking pool is capped at this many products.
CANDIDATE_POOL_SIZE = 100


class RecommendationService:
    """Orchestrates the T2 scoring table with the T3 product-service client — the
    router (T6) only ever calls `recommend()`."""

    def __init__(self, product_client: IProductServiceClient) -> None:
        self._product_client = product_client

    async def recommend(
        self, request: RecommendRequest
    ) -> ApiResponse[list[RecommendedProductDto]]:
        score_by_frame_shape: dict[str, float] = {
            frame_shape.value: score
            for frame_shape, score in get_ranked_frame_shapes(request.faceShape)
        }

        products = await self._product_client.list_products(
            face_shape=request.faceShape.value,
            gender_target=request.genderTarget.value if request.genderTarget else None,
            min_price=request.minPrice,
            max_price=request.maxPrice,
            # Always fetch the full candidate pool (product-service caps a page at 100) and
            # rank all of it before paginating, so page N is a stable slice of one ranking
            # instead of depending on product-service's own (createdAt-based) ordering.
            limit=CANDIDATE_POOL_SIZE,
        )

        scored: list[RecommendedProductDto] = [
            product.model_copy(
                update={"score": score_by_frame_shape.get(product.frameShape.value, 0.0)}
            )
            for product in products
        ]
        scored.sort(key=lambda product: product.score, reverse=True)

        start = (request.page - 1) * request.limit
        return paginated(
            scored[start : start + request.limit],
            total=len(scored),
            page=request.page,
            limit=request.limit,
        )


def get_recommendation_service(
    product_client: IProductServiceClient = Depends(get_product_service_client),
) -> RecommendationService:
    """FastAPI `Depends` provider — constructs the service with its client dep injected."""
    return RecommendationService(product_client)
