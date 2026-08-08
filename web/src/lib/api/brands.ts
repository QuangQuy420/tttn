import type {
  Brand,
  CreateBrandPayload,
  UpdateBrandPayload,
} from "@/types/product";
import { apiFetch } from "./client";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// Mirrors getCategories in ./products.ts — a flat GET, no query params, calling GET /brands
// (api-gateway's BrandsController forwards to product-service's GET /brands).
export function getBrands(): Promise<Brand[]> {
  return apiFetch<Brand[]>("/brands");
}

export function createBrand(payload: CreateBrandPayload, token: string): Promise<Brand> {
  return apiFetch<Brand>("/brands", {
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
  return apiFetch<Brand>(`/brands/${encodeURIComponent(id)}`, {
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
