import type { PaginatedResponse } from "@/types/api";
import type { Category } from "@/types/category";
import type { Product, ProductListParams } from "@/types/product";
import { apiFetch } from "./client";

export function getProducts(
  params: ProductListParams = {},
): Promise<PaginatedResponse<Product>> {
  const query = new URLSearchParams();
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.frameShape) query.set("frameShape", params.frameShape);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));

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
