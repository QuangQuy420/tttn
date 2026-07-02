"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useCategories } from "@/hooks/useCategories";
import { useProducts } from "@/hooks/useProducts";
import type { FrameShape } from "@/types/product";
import { ProductFilters } from "./ProductFilters";
import { ProductGrid } from "./ProductGrid";

// Reads/writes filters via the URL search params so filtered views are shareable/bookmarkable
// and the browser back button works as expected.
export function ProductListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const categoryId = searchParams.get("categoryId") ?? undefined;
  const frameShape = (searchParams.get("frameShape") as FrameShape | null) ?? undefined;

  const { products, isLoading, error } = useProducts({ categoryId, frameShape });
  const { categories } = useCategories();

  function updateFilters(next: { categoryId?: string; frameShape?: FrameShape }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextCategoryId = "categoryId" in next ? next.categoryId : categoryId;
    const nextFrameShape = "frameShape" in next ? next.frameShape : frameShape;

    if (nextCategoryId) params.set("categoryId", nextCategoryId);
    else params.delete("categoryId");

    if (nextFrameShape) params.set("frameShape", nextFrameShape);
    else params.delete("frameShape");

    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }

  return (
    <section aria-labelledby="catalog-heading">
      <h1 id="catalog-heading">Products</h1>
      <ProductFilters
        categories={categories}
        categoryId={categoryId}
        frameShape={frameShape}
        onCategoryChange={(nextCategoryId) => updateFilters({ categoryId: nextCategoryId })}
        onFrameShapeChange={(nextFrameShape) => updateFilters({ frameShape: nextFrameShape })}
      />
      {isLoading && <LoadingState label="Loading products..." />}
      {!isLoading && error && <ErrorState message={error} />}
      {!isLoading && !error && <ProductGrid products={products} />}
    </section>
  );
}
