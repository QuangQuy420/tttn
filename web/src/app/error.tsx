"use client";

import { ErrorState } from "@/components/common/ErrorState";

// Route-level fallback for errors that escape a page's own loading/error handling
// (e.g. a render error, not just a failed fetch — those are handled inline via
// ErrorState in ProductListPage/ProductDetailPage per T26).
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <ErrorState message="Đã có lỗi xảy ra." />
      <button type="button" onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
