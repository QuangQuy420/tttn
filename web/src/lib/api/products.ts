import type { PaginatedResponse } from "@/types/api";
import type { Category } from "@/types/category";
import type {
  CreateProductPayload,
  CreateVariantPayload,
  FaceShapeTag,
  Product,
  ProductImage,
  ProductListParams,
  ProductVariant,
  UpdateProductPayload,
  UpdateVariantPayload,
} from "@/types/product";
import { apiFetch } from "./client";

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

// Returns the single created/updated variant (not the whole product) — mirrors
// product-service's ProductVariantResponseDto returned by POST/PATCH .../variants[/:variantId].
export function createVariant(
  productId: string,
  payload: CreateVariantPayload,
  token: string,
): Promise<ProductVariant> {
  return apiFetch<ProductVariant>(`/products/${encodeURIComponent(productId)}/variants`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateVariant(
  productId: string,
  variantId: string,
  payload: UpdateVariantPayload,
  token: string,
): Promise<ProductVariant> {
  return apiFetch<ProductVariant>(
    `/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    },
  );
}

export function deleteVariant(
  productId: string,
  variantId: string,
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
}

// Returns the newly-created image (append, not replace) — mirrors product-service's
// ProductImageResponseDto returned by POST /products/:id/images. `variantId` attaches the image
// to a specific variant's own image group; omitted (or undefined) attaches it to the base product.
export function uploadProductImage(
  id: string,
  file: File,
  token: string,
  variantId?: string,
): Promise<ProductImage> {
  const form = new FormData();
  if (variantId) form.append("variantId", variantId);
  form.append("file", file);
  return apiFetch<ProductImage>(`/products/${encodeURIComponent(id)}/images`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
}

export function setProductImageThumbnail(
  productId: string,
  imageId: string,
  token: string,
): Promise<ProductImage> {
  return apiFetch<ProductImage>(
    `/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ isThumbnail: true }),
    },
  );
}

export function deleteProductImage(
  productId: string,
  imageId: string,
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    },
  );
}

// Re-exported so admin form code can import FaceShapeTag alongside the API functions if convenient.
export type { FaceShapeTag };
