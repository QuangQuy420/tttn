import { ReviewStatus } from '../../db/enums/review-status.enum';

export class ReviewResponseDto {
  id: string;
  productId: string;
  userId: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** Admin moderation row — adds the reviewed product's name. */
export class AdminReviewResponseDto extends ReviewResponseDto {
  productName: string;
}

export class ReviewSummaryResponseDto {
  /** Average of PUBLISHED ratings, 2 decimals (0 when there are none). */
  avgRating: number;
  reviewCount: number;
  /** PUBLISHED review count per star, keys `1`..`5`. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}
