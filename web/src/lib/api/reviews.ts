import type { PageParams, Paginated } from "@/types/api";
import type {
  AdminReview,
  AdminReviewListParams,
  CreateReviewPayload,
  Review,
  ReviewStatus,
  ReviewSummary,
  UpdateReviewPayload,
} from "@/types/engagement";
import { apiFetch, apiFetchData, apiFetchPage } from "./client";
import { pageQuery } from "./query";

// Calls api-gateway's review routes (api-gateway/src/routes/engagement.controller.ts): the
// summary/list are public; "mine" and writes need a token; /admin/reviews needs product:manage.

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function reviewsPath(productId: string): string {
  return `/products/${encodeURIComponent(productId)}/reviews`;
}

export function getReviewSummary(productId: string): Promise<ReviewSummary> {
  return apiFetchData<ReviewSummary>(`${reviewsPath(productId)}/summary`);
}

// PUBLISHED reviews, newest first.
export function getProductReviews(
  productId: string,
  params: PageParams = {},
): Promise<Paginated<Review>> {
  return apiFetchPage<Review>(`${reviewsPath(productId)}${pageQuery(params)}`);
}

// The caller's own review of this product, or null when they have none.
export function getMyReview(token: string, productId: string): Promise<Review | null> {
  return apiFetchData<Review | null>(`${reviewsPath(productId)}/mine`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function createReview(
  token: string,
  productId: string,
  payload: CreateReviewPayload,
): Promise<Review> {
  return apiFetchData<Review>(reviewsPath(productId), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateMyReview(
  token: string,
  productId: string,
  payload: UpdateReviewPayload,
): Promise<Review> {
  return apiFetchData<Review>(`${reviewsPath(productId)}/mine`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteMyReview(token: string, productId: string): Promise<void> {
  return apiFetch<void>(`${reviewsPath(productId)}/mine`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function getAdminReviews(
  token: string,
  params: AdminReviewListParams = {},
): Promise<Paginated<AdminReview>> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.limit !== undefined) query.set("limit", String(params.limit));

  const queryString = query.toString();
  return apiFetchPage<AdminReview>(`/admin/reviews${queryString ? `?${queryString}` : ""}`, {
    method: "GET",
    headers: authHeaders(token),
  });
}

export function setReviewStatus(
  token: string,
  reviewId: string,
  status: ReviewStatus,
): Promise<Review> {
  return apiFetchData<Review>(`/admin/reviews/${encodeURIComponent(reviewId)}/status`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
}
