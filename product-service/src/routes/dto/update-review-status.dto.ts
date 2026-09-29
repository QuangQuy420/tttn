import { IsEnum } from 'class-validator';
import { ReviewStatus } from '../../db/enums/review-status.enum';

export class UpdateReviewStatusDto {
  @IsEnum(ReviewStatus)
  status: ReviewStatus;
}
