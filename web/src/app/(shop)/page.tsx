import { Suspense } from "react";
import { LoadingState } from "@/components/common/LoadingState";
import { ProductListPage } from "@/components/products/ProductListPage";

export default function Home() {
  // ProductListPage reads filters via useSearchParams(), which Next.js requires to be
  // wrapped in Suspense so the rest of the route can still be statically rendered.
  return (
    <Suspense fallback={<LoadingState label="Loading products..." />}>
      <ProductListPage />
    </Suspense>
  );
}
