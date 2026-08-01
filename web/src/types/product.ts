import type { Category } from "./category";

// Mirrors product-service's response DTOs (src/routes/dto/*.ts) field-for-field
// (camelCase: frameShape, basePrice, genderTarget, etc.).

export type FrameShape =
  | "ROUND"
  | "SQUARE"
  | "OVAL"
  | "CAT_EYE"
  | "AVIATOR"
  | "RECTANGLE"
  | "WAYFARER"
  | "RIMLESS";

export type GenderTarget = "MALE" | "FEMALE" | "UNISEX";

export type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

// Face shape taxonomy (khuôn mặt shapes) — used only by Product.faceShapes (which face shapes a
// product suits). A different taxonomy from FrameShape above — do not conflate the two, mirrors
// product-service's FaceShape enum (src/db/enums/face-shape.enum.ts).
export type FaceShapeTag = "ROUND" | "SQUARE" | "OVAL" | "HEART" | "DIAMOND" | "OBLONG";

export interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface ProductVariant {
  id: string;
  color: string;
  size: string;
  extraPrice: number;
  skuVariant: string;
  // `quantity - reservedQuantity` in ps_inventory; only populated by GET /products/:id
  // (product-service's ProductsService.findOne()) — undefined on list/search results.
  stock?: number;
}

export interface ProductImage {
  id: string;
  imageUrl: string;
  isThumbnail: boolean;
  sortOrder: number;
  variantId: string | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string | null;
  faceFitNote: string | null;
  frameShape: FrameShape;
  genderTarget: GenderTarget;
  material: string | null;
  basePrice: number;
  status: ProductStatus;
  brand: Brand;
  category: Category;
  variants: ProductVariant[];
  images: ProductImage[];
  faceShapes: FaceShapeTag[];
}

export interface ProductListParams {
  categoryId?: string;
  frameShape?: FrameShape;
  page?: number;
  limit?: number;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  includeAllStatuses?: boolean;
}

// Mirrors product-service's CreateProductDto (src/routes/dto/create-product.dto.ts) field-for-field.
export interface CreateProductPayload {
  name: string;
  categoryId: string;
  brandId: string;
  frameShape: FrameShape;
  genderTarget: GenderTarget;
  material?: string | null;
  basePrice: number;
  description?: string | null;
  faceFitNote?: string | null;
  faceShapes?: FaceShapeTag[];
  status?: ProductStatus;
}

// Mirrors product-service's UpdateProductDto (PartialType(CreateProductDto)) — every field optional.
export type UpdateProductPayload = Partial<CreateProductPayload>;

// Mirrors product-service's CreateVariantDto (src/routes/dto/create-variant.dto.ts).
export interface CreateVariantPayload {
  color: string;
  size: string;
  extraPrice?: number;
  stock?: number;
}

// Mirrors product-service's UpdateVariantDto (PartialType(CreateVariantDto)) — every field optional.
export type UpdateVariantPayload = Partial<CreateVariantPayload>;
