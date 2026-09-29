import type {
  Brand,
  CreateBrandPayload,
  UpdateBrandPayload,
} from "@/types/product";
import type { PageParams, Paginated } from "@/types/api";
import { apiFetch, apiFetchData, apiFetchPage } from "./client";
import { pageQuery } from "./query";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// Mirrors getCategories in ./products.ts — a paginated GET /brands (api-gateway's
// BrandsController forwards to product-service's GET /brands).
export function getBrands(params: PageParams = {}): Promise<Paginated<Brand>> {
  return apiFetchPage<Brand>(`/brands${pageQuery(params)}`);
}

export function createBrand(payload: CreateBrandPayload, token: string): Promise<Brand> {
  return apiFetchData<Brand>("/brands", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateBrand(
  id: string,
  payload: UpdateBrandPayload,
  token: string,
): Promise<Brand> {
  return apiFetchData<Brand>(`/brands/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteBrand(id: string, token: string): Promise<void> {
  return apiFetch<void>(`/brands/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}
