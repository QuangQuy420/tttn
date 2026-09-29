import { Suspense } from "react";
import { LoadingState } from "@/components/common/LoadingState";
import { OrderListPage } from "@/components/orders/OrderListPage";

export default function Orders() {
  // OrderListPage reads `?page=` via useSearchParams(), which Next.js requires to be wrapped in
  // Suspense so the rest of the route can still be statically rendered (same pattern as the root
  // page wrapping ProductListPage).
  return (
    <Suspense fallback={<LoadingState label="Đang tải đơn hàng..." />}>
      <OrderListPage />
    </Suspense>
  );
}
