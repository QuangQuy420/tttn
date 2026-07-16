"use client";

import { useEffect, useState } from "react";
import { ApiError, getProductById } from "@/lib/api";
import type { Product } from "@/types/product";

interface UseProductResult {
  product: Product | null;
  isLoading: boolean;
  error: string | null;
}

// `id: null` covers pages that may not have a product chosen yet (e.g. the camera-first
// try-on landing state) — skips the fetch entirely rather than making the caller
// conditionally call this hook, which Rules of Hooks doesn't allow.
export function useProduct(id: string | null): UseProductResult {
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No id yet (camera-first try-on landing state) — nothing to fetch. `product`/`error`
    // already default to null and no current caller reads `isLoading` while id is null (see
    // TryOnPage's `activeId &&` guards), so there's nothing to reset here.
    if (id === null) return;

    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getProductById(id as string);
        if (!cancelled) setProduct(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load product.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return { product, isLoading, error };
}
