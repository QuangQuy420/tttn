"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { Pagination } from "@/components/common/Pagination";
import {
  ApiError,
  createReview,
  deleteMyReview,
  getMyReview,
  getProductReviews,
  getReviewSummary,
  updateMyReview,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { PageMeta } from "@/types/api";
import type { Review, ReviewSummary } from "@/types/engagement";
import { RatingStars } from "./RatingStars";

const PAGE_SIZE = 5;
const COMMENT_MAX_LENGTH = 1000;
const STARS = [5, 4, 3, 2, 1];

interface ProductReviewsProps {
  productId: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("vi-VN");
}

// Review block under the product detail: summary (average + 1–5 star distribution), the paginated
// PUBLISHED list, and the logged-in user's own review form (create / edit / delete). Only buyers
// can post — the API's 403/409 message is shown as-is.
export function ProductReviews({ productId }: ProductReviewsProps) {
  const [page, setPage] = useState(1);
  // Bumped after every write so the summary, list and "mine" all refetch.
  const [reloadKey, setReloadKey] = useState(0);

  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Starts false to match the server render, synced from localStorage in the effect below.
  const [authenticated, setAuthenticated] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);
  const [myReview, setMyReview] = useState<Review | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const [nextSummary, result] = await Promise.all([
          getReviewSummary(productId),
          getProductReviews(productId, { page, limit: PAGE_SIZE }),
        ]);
        if (!cancelled) {
          setSummary(nextSummary);
          setReviews(result.data);
          setMeta(result.meta);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải đánh giá.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [productId, page, reloadKey]);

  useEffect(() => {
    function handleAuthChange() {
      setAuthVersion((value) => value + 1);
    }

    window.addEventListener("auth-change", handleAuthChange);
    return () => window.removeEventListener("auth-change", handleAuthChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      setAuthenticated(Boolean(token));
      if (!token) {
        setMyReview(null);
        return;
      }

      try {
        const mine = await getMyReview(token, productId);
        if (!cancelled) setMyReview(mine ?? null);
      } catch {
        // Not fatal — the form still works and the API reports a duplicate with 409.
        if (!cancelled) setMyReview(null);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [productId, authVersion, reloadKey]);

  function startEditing() {
    setRating(myReview?.rating ?? 0);
    setComment(myReview?.comment ?? "");
    setFormError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setFormError(null);
    setIsEditing(false);
  }

  function afterWrite() {
    setIsEditing(false);
    setRating(0);
    setComment("");
    setPage(1);
    setReloadKey((value) => value + 1);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAccessToken();
    if (!token) {
      setFormError("Bạn cần đăng nhập để đánh giá.");
      return;
    }
    if (rating < 1) {
      setFormError("Vui lòng chọn số sao.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    const trimmed = comment.trim();
    try {
      if (myReview) {
        // An empty comment clears it on edit; on create it's simply omitted.
        await updateMyReview(token, productId, { rating, comment: trimmed });
      } else {
        await createReview(token, productId, {
          rating,
          ...(trimmed ? { comment: trimmed } : {}),
        });
      }
      afterWrite();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không thể gửi đánh giá.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    const token = getAccessToken();
    if (!token) return;
    if (!window.confirm("Xoá đánh giá của bạn?")) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      await deleteMyReview(token, productId);
      setMyReview(null);
      afterWrite();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không thể xoá đánh giá.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const showForm = authenticated && (!myReview || isEditing);

  return (
    <section aria-labelledby="product-reviews-heading" className="product-reviews">
      <h2 id="product-reviews-heading">Đánh giá sản phẩm</h2>

      {summary && (
        <div className="product-reviews__summary">
          <div className="product-reviews__average">
            <span className="product-reviews__average-value">
              {summary.avgRating.toLocaleString("vi-VN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </span>
            <RatingStars rating={summary.avgRating} />
            <span className="product-reviews__count">{summary.reviewCount} đánh giá</span>
          </div>
          <ul className="product-reviews__distribution" aria-label="Phân bố số sao">
            {STARS.map((star) => {
              const count = summary.distribution[String(star)] ?? 0;
              const percent = summary.reviewCount > 0 ? (count / summary.reviewCount) * 100 : 0;
              return (
                <li key={star} className="product-reviews__bar-row">
                  <span>{star} ★</span>
                  <span className="product-reviews__bar">
                    <span className="product-reviews__bar-fill" style={{ width: `${percent}%` }} />
                  </span>
                  <span>{count}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="product-reviews__mine">
        {!authenticated && (
          <p className="product-reviews__hint">
            <Link href="/login">Đăng nhập</Link> để viết đánh giá cho sản phẩm bạn đã mua.
          </p>
        )}

        {authenticated && myReview && !isEditing && (
          <div className="product-reviews__item product-reviews__item--mine">
            <p className="product-reviews__item-head">
              <strong>Đánh giá của bạn</strong>
              <RatingStars rating={myReview.rating} />
            </p>
            {myReview.status === "HIDDEN" && (
              <p className="product-reviews__hint">Đánh giá của bạn đang bị ẩn bởi quản trị viên.</p>
            )}
            {myReview.comment && <p className="product-reviews__comment">{myReview.comment}</p>}
            <div className="product-reviews__actions">
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={startEditing}
                disabled={isSubmitting}
              >
                Sửa
              </button>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => void handleDelete()}
                disabled={isSubmitting}
              >
                Xoá
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <form className="product-reviews__form" onSubmit={(event) => void handleSubmit(event)}>
            <p className="product-reviews__form-title">
              {myReview ? "Sửa đánh giá của bạn" : "Viết đánh giá"}
            </p>
            <div className="star-picker" role="radiogroup" aria-label="Số sao">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  aria-label={`${star} sao`}
                  className={`star-picker__star${star <= rating ? " star-picker__star--active" : ""}`}
                  onClick={() => setRating(star)}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              className="admin-form-textarea"
              rows={4}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Chia sẻ cảm nhận của bạn về sản phẩm (không bắt buộc)"
              aria-label="Nội dung đánh giá"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
            {formError && <ErrorState message={formError} />}
            <div className="product-reviews__actions">
              <button type="submit" className="btn btn--primary btn--small" disabled={isSubmitting}>
                {isSubmitting ? "Đang gửi..." : "Gửi đánh giá"}
              </button>
              {isEditing && (
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={cancelEditing}
                  disabled={isSubmitting}
                >
                  Huỷ
                </button>
              )}
            </div>
          </form>
        )}

        {!showForm && formError && <ErrorState message={formError} />}
      </div>

      {isLoading && <LoadingState label="Đang tải đánh giá..." />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && reviews.length === 0 && (
        <p className="product-reviews__hint">Chưa có đánh giá nào cho sản phẩm này.</p>
      )}

      {!isLoading && !error && reviews.length > 0 && (
        <ul className="product-reviews__list">
          {reviews.map((review) => (
            <li key={review.id} className="product-reviews__item">
              <p className="product-reviews__item-head">
                <strong>{review.reviewerName}</strong>
                <RatingStars rating={review.rating} />
                {review.isVerifiedPurchase && (
                  <span className="product-reviews__verified">Đã mua hàng</span>
                )}
                <span className="product-reviews__date">{formatDate(review.createdAt)}</span>
              </p>
              {review.comment && <p className="product-reviews__comment">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !error && meta && (
        <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
      )}
    </section>
  );
}
