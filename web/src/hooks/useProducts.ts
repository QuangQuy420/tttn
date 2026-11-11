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

// `token` (admin pages) is sent as the Authorization header so the gateway honours
// `includeAllStatuses` for a `product:manage` holder (AC20); storefront callers omit it.
export function useProducts(
  params: ProductListParams,
  token?: string | null,
): UseProductsResult {
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
      const listParams: ProductListParams = {
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
      };
      // Anonymous callers call getProducts(params) alone; the token goes along only when set.
      const response = await (token ? getProducts(listParams, token) : getProducts(listParams));
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
        const listParams: ProductListParams = {
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
        };
        const response = await (token ? getProducts(listParams, token) : getProducts(listParams));
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
    token,
  ]);

  return { products, meta, isLoading, error, refetch: run };
}
