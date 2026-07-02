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
  frameShape: FrameShape;
  genderTarget: GenderTarget;
  material: string | null;
  basePrice: number;
  status: ProductStatus;
  brand: Brand;
  category: Category;
  variants: ProductVariant[];
  images: ProductImage[];
}

export interface ProductListParams {
  categoryId?: string;
  frameShape?: FrameShape;
  page?: number;
  limit?: number;
}
