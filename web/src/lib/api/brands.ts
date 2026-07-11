import type { Brand } from "@/types/product";
import { apiFetch } from "./client";

// Mirrors getCategories in ./products.ts — a flat GET, no query params, calling GET /brands
// (api-gateway's BrandsController forwards to product-service's GET /brands).
export function getBrands(): Promise<Brand[]> {
  return apiFetch<Brand[]>("/brands");
}
