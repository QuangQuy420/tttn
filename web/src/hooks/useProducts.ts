"use client";

import { useEffect, useState } from "react";
import { ApiError, getProducts } from "@/lib/api";
import type { Product, ProductListParams } from "@/types/product";

interface UseProductsResult {
  products: Product[];
  isLoading: boolean;
  error: string | null;
}

export function useProducts(params: ProductListParams): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { categoryId, frameShape, page, limit, search, minPrice, maxPrice } = params;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getProducts({
          categoryId,
          frameShape,
          page,
          limit,
          search,
          minPrice,
          maxPrice,
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

    void run();

    return () => {
      cancelled = true;
    };
  }, [categoryId, frameShape, page, limit, search, minPrice, maxPrice]);

  return { products, isLoading, error };
}
