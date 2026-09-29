import type { PageParams, Paginated } from "@/types/api";
import type { WishlistAddResult } from "@/types/engagement";
import type { Product } from "@/types/product";
import { apiFetch, apiFetchData, apiFetchPage } from "./client";
import { pageQuery } from "./query";

// Calls api-gateway's wishlist routes (api-gateway/src/routes/engagement.controller.ts), which
// forward to product-service's /wishlist with the userId from the caller's verified JWT.

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// Liked products, newest first.
export function getWishlist(token: string, params: PageParams = {}): Promise<Paginated<Product>> {
  return apiFetchPage<Product>(`/wishlist${pageQuery(params)}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

// Every liked product id (not paginated) — used to paint the ❤ buttons.
export function getWishlistProductIds(token: string): Promise<string[]> {
  return apiFetchData<string[]>("/wishlist/product-ids", {
    method: "GET",
    headers: authHeaders(token),
  });
}

// Idempotent: `created` is false when the product was already liked.
export function addToWishlist(token: string, productId: string): Promise<WishlistAddResult> {
  return apiFetchData<WishlistAddResult>(`/wishlist/${encodeURIComponent(productId)}`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function removeFromWishlist(token: string, productId: string): Promise<void> {
  return apiFetch<void>(`/wishlist/${encodeURIComponent(productId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}
