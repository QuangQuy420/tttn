// Wishlist + review shapes — mirror product-service's review DTOs (src/routes/dto/
// review-response.dto.ts) as passed through by api-gateway's EngagementController.

export type ReviewStatus = "PUBLISHED" | "HIDDEN";

export interface Review {
  id: string;
  productId: string;
  userId: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

// GET /admin/reviews adds the product's name to each row.
export interface AdminReview extends Review {
  productName: string;
}

export interface ReviewSummary {
  avgRating: number;
  reviewCount: number;
  // Count per star, keyed "1".."5".
  distribution: Record<string, number>;
}

export interface CreateReviewPayload {
  rating: number;
  comment?: string;
}

export type UpdateReviewPayload = Partial<CreateReviewPayload>;

export interface AdminReviewListParams {
  page?: number;
  limit?: number;
  status?: ReviewStatus;
}

export interface WishlistAddResult {
  created: boolean;
}
