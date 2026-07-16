import type { PaginatedResponse } from "@/types/api";
import type { Category } from "@/types/category";
import type {
  CreateProductPayload,
  FaceShapeTag,
  Product,
  ProductImage,
  ProductListParams,
  UpdateProductPayload,
} from "@/types/product";
import { apiFetch } from "./client";

// Image upload slot -> matches api-gateway/product-service's `slot` field
// (main | angle1 | angle2 | angle3 -> sortOrder 0-3, main is the thumbnail).
export type ImageSlot = "main" | "angle1" | "angle2" | "angle3";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getProducts(
  params: ProductListParams = {},
): Promise<PaginatedResponse<Product>> {
  const query = new URLSearchParams();
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.frameShape) query.set("frameShape", params.frameShape);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.minPrice !== undefined) query.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) query.set("maxPrice", String(params.maxPrice));
  if (params.includeAllStatuses) query.set("includeAllStatuses", "true");

  const queryString = query.toString();
  return apiFetch<PaginatedResponse<Product>>(
    `/products${queryString ? `?${queryString}` : ""}`,
  );
}

export function getProductById(id: string): Promise<Product> {
  return apiFetch<Product>(`/products/${encodeURIComponent(id)}`);
}

export function getCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/categories");
}

export function createProduct(
  payload: CreateProductPayload,
  token: string,
): Promise<Product> {
  return apiFetch<Product>("/products", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateProduct(
  id: string,
  payload: UpdateProductPayload,
  token: string,
): Promise<Product> {
  return apiFetch<Product>(`/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(id: string, token: string): Promise<void> {
  return apiFetch<void>(`/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// Returns the single uploaded/replaced image (not the whole product) — mirrors
// product-service's ProductImageResponseDto returned by POST /products/:id/images.
export function uploadProductImage(
  id: string,
  slot: ImageSlot,
  file: File,
  token: string,
): Promise<ProductImage> {
  const form = new FormData();
  form.append("slot", slot);
  form.append("file", file);
  return apiFetch<ProductImage>(`/products/${encodeURIComponent(id)}/images`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
}

// Re-exported so admin form code can import FaceShapeTag alongside the API functions if convenient.
export type { FaceShapeTag };
