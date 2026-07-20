import type { AddCartItemPayload, Cart, UpdateCartItemPayload } from "@/types/cart";
import { apiFetch } from "./client";

// Calls api-gateway's cart proxy (api-gateway/src/routes/orders.controller.ts's
// CartController, @Controller('api/cart')), which forwards to order-service's
// /api/v1/carts/{userId}/... using the userId from the caller's verified JWT — never passed
// from here. See plan T5/T6/T9.

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getCart(token: string): Promise<Cart> {
  return apiFetch<Cart>("/cart", {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function addCartItem(token: string, payload: AddCartItemPayload): Promise<Cart> {
  return apiFetch<Cart>("/cart/items", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateCartItem(
  token: string,
  variantId: string,
  payload: UpdateCartItemPayload,
): Promise<Cart> {
  return apiFetch<Cart>(`/cart/items/${encodeURIComponent(variantId)}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function removeCartItem(token: string, variantId: string): Promise<Cart> {
  return apiFetch<Cart>(`/cart/items/${encodeURIComponent(variantId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function clearCart(token: string): Promise<void> {
  return apiFetch<void>("/cart", {
    method: "DELETE",
    headers: authHeaders(token),
  });
}
