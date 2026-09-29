"use client";

import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Pagination } from "@/components/common/Pagination";
import { RatingStars } from "@/components/reviews/RatingStars";
import { usePageParam } from "@/hooks/usePageParam";
import { ApiError, getAdminReviews, setReviewStatus } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { AdminReview, ReviewStatus } from "@/types/engagement";

const PAGE_SIZE = 20;

const REVIEW_STATUS_LABELS_VI: Record<ReviewStatus, string> = {
  PUBLISHED: "Đang hiển thị",
  HIDDEN: "Đã ẩn",
};

const REVIEW_STATUSES: ReviewStatus[] = ["PUBLISHED", "HIDDEN"];

// Admin review moderation (AC9) — every review across products, filterable by status, with a
// hide/show toggle. Same list/filter/pagination shape as the admin orders page.
export function ReviewModerationPage() {
  const [status, setStatus] = useState<ReviewStatus | undefined>(undefined);
  const [page, setPage] = usePageParam();
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Vui lòng đăng nhập lại.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await getAdminReviews(token, { status, page, limit: PAGE_SIZE });
        if (!cancelled) {
          setReviews(result.data);
          setTotalPages(result.meta.totalPages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải danh sách đánh giá.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [status, page]);

  function handleStatusChange(value: string) {
    setStatus(value ? (value as ReviewStatus) : undefined);
    setPage(1);
  }

  async function handleToggle(review: AdminReview) {
    const token = getAccessToken();
    if (!token) {
      setActionError("Vui lòng đăng nhập lại.");
      return;
    }

    const nextStatus: ReviewStatus = review.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED";
    setUpdatingId(review.id);
    setActionError(null);
    try {
      const updated = await setReviewStatus(token, review.id, nextStatus);
      setReviews((current) =>
        current
          .map((item) => (item.id === review.id ? { ...item, status: updated.status } : item))
          // Under a status filter, a row that no longer matches drops out of the list.
          .filter((item) => !status || item.status === status),
      );
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Không thể cập nhật trạng thái.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">Kiểm duyệt đánh giá</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        <div className="admin-toolbar">
          <label htmlFor="admin-reviews-status-filter" className="orders-page__filter">
            Lọc theo trạng thái
            <select
              id="admin-reviews-status-filter"
              value={status ?? ""}
              onChange={(event) => handleStatusChange(event.target.value)}
            >
              <option value="">Tất cả</option>
              {REVIEW_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {REVIEW_STATUS_LABELS_VI[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {actionError && <ErrorState message={actionError} />}
        {isLoading && <LoadingState label="Đang tải đánh giá..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {!isLoading && !error && (
          <div className="admin-table">
            <div className="admin-table__row admin-table__row--reviews admin-table__row--head">
              <span>Sản phẩm</span>
              <span>Người đánh giá</span>
              <span>Số sao</span>
              <span>Nội dung</span>
              <span>Trạng thái</span>
              <span />
            </div>
            {reviews.map((review) => (
              <div
                key={review.id}
                className="admin-table__row admin-table__row--reviews admin-table__row--body"
              >
                <span className="admin-table__name">{review.productName}</span>
                <span>
                  {review.reviewerName}
                  <span className="admin-table__tag">
                    {" "}
                    · {new Date(review.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </span>
                <span>
                  <RatingStars rating={review.rating} />
                </span>
                <span className="admin-table__comment">{review.comment ?? "—"}</span>
                <span
                  className={`admin-status-badge${review.status === "PUBLISHED" ? " admin-status-badge--active" : ""}`}
                >
                  {REVIEW_STATUS_LABELS_VI[review.status]}
                </span>
                <span className="admin-table__actions">
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    onClick={() => void handleToggle(review)}
                    disabled={updatingId === review.id}
                  >
                    {review.status === "PUBLISHED" ? "Ẩn" : "Hiện"}
                  </button>
                </span>
              </div>
            ))}
            {reviews.length === 0 && (
              <div className="admin-table__empty">Chưa có đánh giá nào.</div>
            )}
          </div>
        )}

        {!isLoading && !error && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </section>
    </>
  );
}
