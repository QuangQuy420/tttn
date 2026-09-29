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

// Mirrors product-service's MaterialType enum (src/db/enums/material-type.enum.ts).
export type MaterialType = "ACETATE" | "METAL" | "TITANIUM" | "TR90" | "PLASTIC" | "MIXED";

// Mirrors product-service's ImageKind enum (src/db/enums/image-kind.enum.ts). TRY_ON = the
// transparent PNG used as the try-on overlay (at most one per product).
export type ImageKind = "GALLERY" | "TRY_ON";

export type ProductSort = "newest" | "price_asc" | "price_desc" | "rating";

// Face shape taxonomy (khuôn mặt shapes) — used only by Product.faceShapes (which face shapes a
// product suits). A different taxonomy from FrameShape above — do not conflate the two, mirrors
// product-service's FaceShape enum (src/db/enums/face-shape.enum.ts).
export type FaceShapeTag = "ROUND" | "SQUARE" | "OVAL" | "HEART" | "DIAMOND" | "OBLONG";

export interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
  description?: string | null;
}

export interface CreateBrandPayload {
  name: string;
  logoUrl?: string | null;
  description?: string | null;
}

export type UpdateBrandPayload = Partial<CreateBrandPayload>;

export interface ProductVariant {
  id: string;
  color: string;
  colorHex: string | null;
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
  kind: ImageKind;
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
  materialType?: MaterialType | null;
  // Frame measurements in mm (integers) — null when not entered.
  lensWidthMm?: number | null;
  bridgeWidthMm?: number | null;
  templeLengthMm?: number | null;
  frameWidthMm?: number | null;
  basePrice: number;
  status: ProductStatus;
  brand: Brand;
  category: Category;
  variants: ProductVariant[];
  images: ProductImage[];
  faceShapes: FaceShapeTag[];
  // PUBLISHED-review aggregates kept on the product row (0 when there are no reviews).
  avgRating?: number;
  reviewCount?: number;
}

export interface ProductListParams {
  categoryId?: string;
  brandId?: string;
  // Comma-joined into `brandIds` on the wire.
  brandIds?: string[];
  frameShape?: FrameShape;
  materialType?: MaterialType;
  color?: string;
  genderTarget?: GenderTarget;
  sort?: ProductSort;
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
  materialType?: MaterialType | null;
  lensWidthMm?: number | null;
  bridgeWidthMm?: number | null;
  templeLengthMm?: number | null;
  frameWidthMm?: number | null;
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
  colorHex: string;
  size: string;
  extraPrice?: number;
  stock?: number;
}

// Mirrors product-service's UpdateVariantDto (PartialType(CreateVariantDto)) — every field optional.
export type UpdateVariantPayload = Partial<CreateVariantPayload>;
