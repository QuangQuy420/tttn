import { Suspense } from "react";
import { LoadingState } from "@/components/common/LoadingState";
import { WishlistPage } from "@/components/wishlist/WishlistPage";

export default function Wishlist() {
  // WishlistPage reads `?page=` via useSearchParams(), which Next.js requires to be wrapped in
  // Suspense (same pattern as the orders page).
  return (
    <Suspense fallback={<LoadingState label="Đang tải danh sách yêu thích..." />}>
      <WishlistPage />
    </Suspense>
  );
}
