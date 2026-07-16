"""Pydantic request/response DTOs for `POST /recommend`.

`FaceShape` and `FrameShape` mirror product-service's enums exactly (same 6/8 values,
same string casing) so requests/responses are directly comparable across services —
see `product-service/src/db/enums/face-shape.enum.ts` and
`product-service/src/db/enums/frame-shape.enum.ts`. Do not invent new values or rename
any of these (same convention `face-processing-service/app/db/models.py` already
follows for `FaceShape`).
"""
import enum

from pydantic import BaseModel, Field


class FaceShape(str, enum.Enum):
    ROUND = "ROUND"
    SQUARE = "SQUARE"
    OVAL = "OVAL"
    HEART = "HEART"
    DIAMOND = "DIAMOND"
    OBLONG = "OBLONG"


class FrameShape(str, enum.Enum):
    ROUND = "ROUND"
    SQUARE = "SQUARE"
    OVAL = "OVAL"
    CAT_EYE = "CAT_EYE"
    AVIATOR = "AVIATOR"
    RECTANGLE = "RECTANGLE"
    WAYFARER = "WAYFARER"
    RIMLESS = "RIMLESS"


class GenderTarget(str, enum.Enum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    UNISEX = "UNISEX"


class RecommendRequest(BaseModel):
    """Request body for `POST /recommend`.

    Note: a `color` filter was deliberately deferred (plan scope decision) — color
    lives per-variant in product-service, one level deeper than what `GET /products`
    filters on today; don't add it here without also touching variant-level filtering.
    """

    faceShape: FaceShape
    genderTarget: GenderTarget | None = None
    minPrice: float | None = Field(default=None, gt=0)
    maxPrice: float | None = Field(default=None, gt=0)
    limit: int | None = Field(default=None, gt=0, le=100)


class ProductImageDto(BaseModel):
    id: str
    variantId: str | None
    imageUrl: str
    isThumbnail: bool
    sortOrder: int


class BrandSummaryDto(BaseModel):
    id: str
    name: str
    logoUrl: str | None


class RecommendedProductDto(BaseModel):
    """Just the fields `web` needs to render a product card, plus a ranking `score`.

    Field names/casing/nesting mirror product-service's `ProductResponseDto`
    (`product-service/src/routes/dto/product-response.dto.ts`) field-for-field —
    `brand` is the same nested `{id, name, logoUrl}` shape there, not a plain string.
    """

    id: str
    sku: str
    name: str
    slug: str
    frameShape: FrameShape
    basePrice: float
    brand: BrandSummaryDto
    images: list[ProductImageDto]
    faceShapes: list[FaceShape]
    score: float = Field(..., description="Ranking score — how well this product's frame shape fits the requested face shape")


class RecommendResponse(BaseModel):
    items: list[RecommendedProductDto]
