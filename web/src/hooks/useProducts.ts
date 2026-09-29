"use client";

import { useEffect, useState } from "react";
import { ApiError, getProducts } from "@/lib/api";
import type { PageMeta } from "@/types/api";
import type { Product, ProductListParams } from "@/types/product";

interface UseProductsResult {
  products: Product[];
  // Pagination info of the last successful fetch (null until the first one resolves).
  meta: PageMeta | null;
  isLoading: boolean;
  error: string | null;
  // Re-runs the same fetch on demand (e.g. after an admin delete) without waiting for a param
  // change — see AdminProductsPage.
  refetch: () => Promise<void>;
}

export function useProducts(params: ProductListParams): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    categoryId,
    brandId,
    frameShape,
    materialType,
    color,
    genderTarget,
    sort,
    page,
    limit,
    search,
    minPrice,
    maxPrice,
    includeAllStatuses,
  } = params;
  // Joined to a primitive so the effect dependency is stable across renders (a new array each
  // render would refetch forever); split back before the call.
  const brandIdsKey = params.brandIds?.join(",") ?? "";

  async function run() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getProducts({
        categoryId,
        brandId,
        brandIds: brandIdsKey ? brandIdsKey.split(",") : undefined,
        frameShape,
        materialType,
        color,
        genderTarget,
        sort,
        page,
        limit,
        search,
        minPrice,
        maxPrice,
        includeAllStatuses,
      });
      setProducts(response.data);
      setMeta(response.meta);
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
          brandIds: brandIdsKey ? brandIdsKey.split(",") : undefined,
          frameShape,
          materialType,
          color,
          genderTarget,
          sort,
          page,
          limit,
          search,
          minPrice,
          maxPrice,
          includeAllStatuses,
        });
        if (!cancelled) {
          setProducts(response.data);
          setMeta(response.meta);
        }
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
  }, [
    categoryId,
    brandId,
    brandIdsKey,
    frameShape,
    materialType,
    color,
    genderTarget,
    sort,
    page,
    limit,
    search,
    minPrice,
    maxPrice,
    includeAllStatuses,
  ]);

  return { products, meta, isLoading, error, refetch: run };
}
