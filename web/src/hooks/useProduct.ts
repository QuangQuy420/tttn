"use client";

import { useEffect, useState } from "react";
import { ApiError, getProductById, getProductBySlug } from "@/lib/api";
import type { Product } from "@/types/product";

interface UseProductResult {
  product: Product | null;
  isLoading: boolean;
  error: string | null;
}

// `key: null` covers pages that may not have a product chosen yet (e.g. the camera-first
// try-on landing state) — skips the fetch entirely rather than making the caller
// conditionally call this hook, which Rules of Hooks doesn't allow.
function useProductResource(
  key: string | null,
  fetchProduct: (key: string) => Promise<Product>,
): UseProductResult {
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // No key yet (camera-first try-on landing state) — nothing to fetch. `product`/`error`
    // already default to null and no current caller reads `isLoading` while key is null (see
    // TryOnPage's `activeSlug &&` guards), so there's nothing to reset here.
    if (key === null) return;

    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchProduct(key as string);
        if (!cancelled) setProduct(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải thông tin sản phẩm.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
    // fetchProduct is always one of the stable module-level api functions below — only the
    // key can actually change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { product, isLoading, error };
}

// Fetches by uuid — admin pages and cart flows, which hold real product ids.
export function useProduct(id: string | null): UseProductResult {
  return useProductResource(id, getProductById);
}

// Fetches by slug — the public shop routes (`/products/[slug]`), where the URL segment is
// the product's slug, not its uuid.
export function useProductBySlug(slug: string | null): UseProductResult {
  return useProductResource(slug, getProductBySlug);
}
