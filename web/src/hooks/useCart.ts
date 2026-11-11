"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Only the newest fetch may write state: a slower, older response (e.g. two quick cart edits)
  // must not overwrite a newer cart (AC71).
  const requestSeqRef = useRef(0);
  // After the first load, refetches run in the background: `isLoading` stays false so pages
  // like CheckoutPage keep their form (and its unsaved input) mounted (AC60).
  const hasLoadedRef = useRef(false);
  const unmountedRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    const isStale = () => unmountedRef.current || seq !== requestSeqRef.current;

    const token = getAccessToken();
    if (!token) {
      // Signed out: the next login's first fetch shows the loading state again.
      hasLoadedRef.current = false;
      if (!isStale()) {
        setCart(null);
        setIsLoading(false);
        setError(null);
      }
      return;
    }

    if (!hasLoadedRef.current) setIsLoading(true);
    setError(null);
    try {
      const response = await getCart(token);
      if (!isStale()) {
        setCart(response);
        hasLoadedRef.current = true;
      }
    } catch (err) {
      if (!isStale()) {
        setError(err instanceof ApiError ? err.message : "Không thể tải giỏ hàng.");
      }
    } finally {
      // A stale call leaves `isLoading` to the newer call, which always settles it.
      if (!isStale()) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    function handleCartChange() {
      void load();
    }

    // Initial load (through the listener so this effect never calls setState in its own body).
    handleCartChange();

    window.addEventListener("cart-change", handleCartChange);
    window.addEventListener("auth-change", handleCartChange);

    return () => {
      unmountedRef.current = true;
      window.removeEventListener("cart-change", handleCartChange);
      window.removeEventListener("auth-change", handleCartChange);
    };
  }, [load]);

  return { cart, totalQuantity: cart?.totalQuantity ?? 0, isLoading, error, refetch: load };
}
