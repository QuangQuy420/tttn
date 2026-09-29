import { IsEnum, IsOptional } from 'class-validator';
import { ReviewStatus } from '../../db/enums/review-status.enum';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListReviewsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}
