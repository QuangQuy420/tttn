import { Suspense } from "react";
import { LoadingState } from "@/components/common/LoadingState";
import { RecommendationsPage } from "@/components/products/RecommendationsPage";

export default function Recommendations() {
  // RecommendationsPage reads faceShape via useSearchParams(), which Next.js requires to be
  // wrapped in Suspense so the rest of the route can still be statically rendered (same pattern
  // as the root page wrapping ProductListPage).
  return (
    <Suspense fallback={<LoadingState label="Đang tải gọng kính được gợi ý..." />}>
      <RecommendationsPage />
    </Suspense>
  );
}
