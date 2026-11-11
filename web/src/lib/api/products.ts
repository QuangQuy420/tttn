import type { PageParams, Paginated } from "@/types/api";
import type {
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from "@/types/category";
import type {
  CreateProductPayload,
  CreateVariantPayload,
  FaceShapeTag,
  ImageKind,
  Product,
  ProductImage,
  ProductListParams,
  ProductVariant,
  UpdateProductPayload,
  UpdateVariantPayload,
} from "@/types/product";
import { apiFetch, apiFetchData, apiFetchPage } from "./client";
import { pageQuery } from "./query";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// Admin reads (AC20): with a token of a `product:manage` holder, the gateway forwards
// `includeAllStatuses=true` so DRAFT / ARCHIVED products show up; for anyone else it drops the
// flag. Without a token the call is anonymous, as on the storefront.
export interface ProductReadOptions {
  token?: string | null;
  includeAllStatuses?: boolean;
}

// Sends the Authorization header only when a token is given (anonymous storefront reads keep
// calling apiFetch* with the path alone).
function readProduct<T>(
  fetcher: (path: string, options?: RequestInit) => Promise<T>,
  path: string,
  token: string | null | undefined,
): Promise<T> {
  return token ? fetcher(path, { headers: authHeaders(token) }) : fetcher(path);
}

export function getProducts(
  params: ProductListParams = {},
  token?: string | null,
): Promise<Paginated<Product>> {
  const query = new URLSearchParams();
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.brandId) query.set("brandId", params.brandId);
  if (params.brandIds && params.brandIds.length > 0) {
    query.set("brandIds", params.brandIds.join(","));
  }
  if (params.frameShape) query.set("frameShape", params.frameShape);
  if (params.materialType) query.set("materialType", params.materialType);
  if (params.color) query.set("color", params.color);
  if (params.genderTarget) query.set("genderTarget", params.genderTarget);
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.minPrice !== undefined) query.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) query.set("maxPrice", String(params.maxPrice));
  if (params.includeAllStatuses) query.set("includeAllStatuses", "true");

  const queryString = query.toString();
  return readProduct(
    apiFetchPage<Product>,
    `/products${queryString ? `?${queryString}` : ""}`,
    token,
  );
}

export function getProductById(
  id: string,
  options: ProductReadOptions = {},
): Promise<Product> {
  const query = options.includeAllStatuses ? "?includeAllStatuses=true" : "";
  return readProduct(
    apiFetchData<Product>,
    `/products/${encodeURIComponent(id)}${query}`,
    options.token,
  );
}

export function getProductBySlug(slug: string): Promise<Product> {
  return apiFetchData<Product>(`/products/slug/${encodeURIComponent(slug)}`);
}

export function getCategories(params: PageParams = {}): Promise<Paginated<Category>> {
  return apiFetchPage<Category>(`/categories${pageQuery(params)}`);
}

export function createCategory(
  payload: CreateCategoryPayload,
  token: string,
): Promise<Category> {
  return apiFetchData<Category>("/categories", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateCategory(
  id: string,
  payload: UpdateCategoryPayload,
  token: string,
): Promise<Category> {
  return apiFetchData<Category>(`/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteCategory(id: string, token: string): Promise<void> {
  return apiFetch<void>(`/categories/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function createProduct(
  payload: CreateProductPayload,
  token: string,
): Promise<Product> {
  return apiFetchData<Product>("/products", {
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
  return apiFetchData<Product>(`/products/${encodeURIComponent(id)}`, {
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
  return apiFetchData<ProductVariant>(`/products/${encodeURIComponent(productId)}/variants`, {
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
  return apiFetchData<ProductVariant>(
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
// `kind` "TRY_ON" marks the image as the product's try-on PNG (the previous one is demoted to
// GALLERY by product-service); omitted defaults to GALLERY server-side.
export function uploadProductImage(
  id: string,
  file: File,
  token: string,
  variantId?: string,
  kind?: ImageKind,
): Promise<ProductImage> {
  const form = new FormData();
  if (variantId) form.append("variantId", variantId);
  if (kind) form.append("kind", kind);
  form.append("file", file);
  return apiFetchData<ProductImage>(`/products/${encodeURIComponent(id)}/images`, {
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
  return apiFetchData<ProductImage>(
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
