"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useCategories } from "@/hooks/useCategories";
import { useProducts } from "@/hooks/useProducts";
import type { FrameShape } from "@/types/product";
import { ProductFilters } from "./ProductFilters";
import { ProductGrid } from "./ProductGrid";

// FR2/T7: how long to wait after the last keystroke before pushing the search term to the URL.
const SEARCH_DEBOUNCE_MS = 300;

interface FilterUpdate {
  categoryId?: string;
  frameShape?: FrameShape;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
}

// Reads/writes filters via the URL search params so filtered views are shareable/bookmarkable
// and the browser back button works as expected.
export function ProductListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const categoryId = searchParams.get("categoryId") ?? undefined;
  const frameShape = (searchParams.get("frameShape") as FrameShape | null) ?? undefined;
  const minPrice = searchParams.has("minPrice") ? Number(searchParams.get("minPrice")) : undefined;
  const maxPrice = searchParams.has("maxPrice") ? Number(searchParams.get("maxPrice")) : undefined;
  const search = searchParams.get("search") ?? undefined;

  const { products, isLoading, error } = useProducts({
    categoryId,
    frameShape,
    minPrice,
    maxPrice,
    search,
  });
  const { categories } = useCategories();

  const [searchInput, setSearchInput] = useState(search ?? "");
  // Tracks the last `search` URL param value we've synced `searchInput` from, so we can react to
  // it changing from outside a keystroke here (e.g. browser back/forward — NFR4) without an
  // effect. This is React's documented "adjust state during render" pattern, not a plain
  // setState-in-effect (which cascades an extra render for no benefit).
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setSearchInput(search ?? "");
  }

  function updateFilters(next: FilterUpdate) {
    const params = new URLSearchParams(searchParams.toString());
    const nextCategoryId = "categoryId" in next ? next.categoryId : categoryId;
    const nextFrameShape = "frameShape" in next ? next.frameShape : frameShape;
    const nextMinPrice = "minPrice" in next ? next.minPrice : minPrice;
    const nextMaxPrice = "maxPrice" in next ? next.maxPrice : maxPrice;
    const nextSearch = "search" in next ? next.search : search;

    if (nextCategoryId) params.set("categoryId", nextCategoryId);
    else params.delete("categoryId");

    if (nextFrameShape) params.set("frameShape", nextFrameShape);
    else params.delete("frameShape");

    if (nextMinPrice !== undefined) params.set("minPrice", String(nextMinPrice));
    else params.delete("minPrice");

    if (nextMaxPrice !== undefined) params.set("maxPrice", String(nextMaxPrice));
    else params.delete("maxPrice");

    if (nextSearch) params.set("search", nextSearch);
    else params.delete("search");

    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }

  // updateFilters closes over this render's categoryId/frameShape/minPrice/maxPrice/searchParams.
  // The debounce timer below can fire well after a later render (e.g. a pill click) has moved
  // those values on — reading it through a ref kept fresh every render (instead of calling the
  // directly-closed-over updateFilters) means the timer always applies the search term on top of
  // whatever filters are current when it actually fires, not whatever they were when it was set.
  const updateFiltersRef = useRef(updateFilters);
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  // Debounce: only push the search term to the URL (and trigger a refetch) after the user
  // stops typing for SEARCH_DEBOUNCE_MS, so we don't fire a request per keystroke.
  useEffect(() => {
    if (searchInput === (search ?? "")) return;
    const timer = setTimeout(() => {
      updateFiltersRef.current({ search: searchInput || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce keys off searchInput only.
  }, [searchInput]);

  return (
    <>
      <section className="hero">
        <div className="hero__content">
          <p className="hero__eyebrow">Eyewear Collection</p>
          <h1 id="catalog-heading" className="hero__title">
            Find the frame
            <br />
            that fits your face
          </h1>
          <p className="hero__subtext">
            Upload a portrait photo and we will analyze your face shape and recommend the frames
            that suit you best — then try them on right in your browser before you buy.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled
            title="Coming soon"
            aria-label="Start face analysis (coming soon)"
          >
            Start Face Analysis
          </button>
        </div>
        <div className="hero__visual" aria-hidden="true" />
      </section>

      <section aria-labelledby="catalog-heading">
        <div className="search-field">
          <svg
            className="search-field__icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            className="search-input"
            aria-label="Search products"
            placeholder="Search by name or frame style"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <ProductFilters
          categories={categories}
          categoryId={categoryId}
          frameShape={frameShape}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onCategoryChange={(nextCategoryId) => updateFilters({ categoryId: nextCategoryId })}
          onFrameShapeChange={(nextFrameShape) => updateFilters({ frameShape: nextFrameShape })}
          onPriceRangeChange={(range) => updateFilters(range)}
        />
        {isLoading && <LoadingState label="Loading products..." />}
        {!isLoading && error && <ErrorState message={error} />}
        {!isLoading && !error && <ProductGrid products={products} />}
      </section>
    </>
  );
}
