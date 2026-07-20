"use client";

import { useEffect, useState } from "react";
import { ApiError, getCart } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { Cart } from "@/types/cart";

// Dispatched after any successful addCartItem/updateCartItem/removeCartItem/clearCart call, the
// same way session.ts dispatches "auth-change" — lets components that don't own the mutation
// (e.g. Header's badge) refetch without prop-drilling a callback through every call site.
export function dispatchCartChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cart-change"));
  }
}

interface UseCartResult {
  cart: Cart | null;
  totalQuantity: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Cart is always for the logged-in user — reads the access token itself (mirrors Header.tsx's
// own getAccessToken() use) rather than requiring every caller to pass one in. Skips the fetch
// entirely when there's no token (logged-out), since cart endpoints require auth.
export function useCart(): UseCartResult {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const token = getAccessToken();
    if (!token) {
      setCart(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await getCart(token);
      setCart(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể tải giỏ hàng.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runEffect() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setCart(null);
          setIsLoading(false);
          setError(null);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await getCart(token);
        if (!cancelled) setCart(response);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải giỏ hàng.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void runEffect();

    function handleCartChange() {
      void runEffect();
    }

    window.addEventListener("cart-change", handleCartChange);
    window.addEventListener("auth-change", handleCartChange);

    return () => {
      cancelled = true;
      window.removeEventListener("cart-change", handleCartChange);
      window.removeEventListener("auth-change", handleCartChange);
    };
  }, []);

  return { cart, totalQuantity: cart?.totalQuantity ?? 0, isLoading, error, refetch: run };
}
