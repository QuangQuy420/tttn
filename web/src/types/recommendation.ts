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
  page?: number;
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
  // Ranking score on a 0–1 scale — equals `finalScore` (was 0–10 before the hybrid ranker).
  score: number;
  // Hybrid ranker components, each 0–1: finalScore = α·preferenceScore + β·faceFitScore.
  preferenceScore: number;
  faceFitScore: number;
  finalScore: number;
  // Vietnamese "why recommended" reasons, at most 2.
  reasons: string[];
}

// `data` of api-gateway's GET /api/recommendations/for-you (single envelope, no `meta`).
// faceShape/faceAnalysisId are null when the user has no face analysis (then beta is 0);
// modelVersion is null when the preference model is not loaded (legacy mode).
export interface ForYouResponse {
  items: RecommendedProduct[];
  faceShape: FaceShapeTag | null;
  faceAnalysisId: string | null;
  modelVersion: string | null;
  alpha: number;
  beta: number;
}
