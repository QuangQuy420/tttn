import type { Brand, FaceShapeTag, FrameShape, GenderTarget, ProductImage } from "./product";

// Mirrors recommendation-service's Pydantic schemas (app/schemas/recommend.py) field-for-field
// (camelCase), same convention as src/types/product.ts mirroring product-service's DTOs.
// Note: recommendation-service deliberately has no `color` filter yet (color lives per-variant,
// one level deeper than what this endpoint filters on) — don't add it here without also touching
// recommendation-service.

export interface RecommendRequest {
  faceShape: FaceShapeTag;
  genderTarget?: GenderTarget;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
}

// Only the fields `web` needs to render a card, plus a ranking `score` — a narrower shape than
// the full `Product` type (no genderTarget/category/variants/description/etc.), mirroring
// RecommendedProductDto (recommendation-service/app/schemas/recommend.py) exactly.
export interface RecommendedProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  frameShape: FrameShape;
  basePrice: number;
  brand: Brand;
  images: ProductImage[];
  faceShapes: FaceShapeTag[];
  score: number;
}

export interface RecommendResponse {
  items: RecommendedProduct[];
}
