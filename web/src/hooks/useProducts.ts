"use client";

import { useEffect, useState } from "react";
import { ApiError, getProducts } from "@/lib/api";
import type { Product, ProductListParams } from "@/types/product";

interface UseProductsResult {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  // Re-runs the same fetch on demand (e.g. after an admin delete) without waiting for a param
  // change — see AdminProductsPage.
  refetch: () => Promise<void>;
}

export function useProducts(params: ProductListParams): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { categoryId, brandId, frameShape, page, limit, search, minPrice, maxPrice, includeAllStatuses } =
    params;

  async function run() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getProducts({
        categoryId,
        brandId,
        frameShape,
        page,
        limit,
        search,
        minPrice,
        maxPrice,
        includeAllStatuses,
      });
      setProducts(response.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load products.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runEffect() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getProducts({
          categoryId,
          brandId,
          frameShape,
          page,
          limit,
          search,
          minPrice,
          maxPrice,
          includeAllStatuses,
        });
        if (!cancelled) setProducts(response.items);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load products.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void runEffect();

    return () => {
      cancelled = true;
    };
  }, [categoryId, brandId, frameShape, page, limit, search, minPrice, maxPrice, includeAllStatuses]);

  return { products, isLoading, error, refetch: run };
}
