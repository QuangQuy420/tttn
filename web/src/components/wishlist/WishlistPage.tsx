"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Pagination } from "@/components/common/Pagination";
import { ProductGrid } from "@/components/products/ProductGrid";
import { usePageParam } from "@/hooks/usePageParam";
import { ApiError, getWishlist } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { Paginated } from "@/types/api";
import type { Product } from "@/types/product";

const PAGE_SIZE = 12;

// "Yêu thích" — the logged-in user's liked products, newest first. Refetches on
// "wishlist-change" so un-liking a card here drops it from the list.
export function WishlistPage() {
  const [page, setPage] = usePageParam();
  const [response, setResponse] = useState<Paginated<Product> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setResponse(null);
          setIsLoggedOut(true);
          setIsLoading(false);
        }
        return;
      }

      setIsLoggedOut(false);
      setIsLoading(true);
      setError(null);
      try {
        const result = await getWishlist(token, { page, limit: PAGE_SIZE });
        if (!cancelled) setResponse(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải danh sách yêu thích.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    function handleChange() {
      void run();
    }

    window.addEventListener("wishlist-change", handleChange);
    window.addEventListener("auth-change", handleChange);

    return () => {
      cancelled = true;
      window.removeEventListener("wishlist-change", handleChange);
      window.removeEventListener("auth-change", handleChange);
    };
  }, [page]);

  const products = response?.data ?? [];

  return (
    <section aria-labelledby="wishlist-heading" className="orders-page">
      <h1 id="wishlist-heading">Sản phẩm yêu thích</h1>

      {isLoading && <LoadingState label="Đang tải danh sách yêu thích..." />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && isLoggedOut && (
        <p className="orders-page__empty">
          Vui lòng <Link href="/login">đăng nhập</Link> để xem sản phẩm yêu thích.
        </p>
      )}

      {!isLoading && !isLoggedOut && !error && products.length === 0 && (
        <p className="orders-page__empty">Bạn chưa thích sản phẩm nào.</p>
      )}

      {!isLoading && !isLoggedOut && !error && products.length > 0 && (
        <>
          <ProductGrid products={products} />
          {response && (
            <Pagination
              page={page}
              totalPages={response.meta.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
