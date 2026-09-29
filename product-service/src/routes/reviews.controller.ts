import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewsService } from '../services/reviews.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { UpdateReviewStatusDto } from './dto/update-review-status.dto';
import {
  AdminReviewResponseDto,
  ReviewResponseDto,
  ReviewSummaryResponseDto,
} from './dto/review-response.dto';
import { CurrentUserId, CurrentUserName } from './request-user.decorator';
import { Paginated } from '../common/api-response';

/**
 * Public review reads, the caller's own review (`mine`), and admin moderation. Auth and the
 * `product:manage` permission for `admin/*` are enforced by api-gateway.
 */
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('products/:id/reviews/summary')
  summary(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReviewSummaryResponseDto> {
    return this.reviewsService.summary(id);
  }

  @Get('products/:id/reviews')
  listForProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ReviewResponseDto>> {
    return this.reviewsService.listForProduct(id, query);
  }

  /** `data: null` when the caller hasn't reviewed this product. */
  @Get('products/:id/reviews/mine')
  findMine(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReviewResponseDto | null> {
    return this.reviewsService.findMine(userId, id);
  }

  @Post('products/:id/reviews')
  create(
    @CurrentUserId() userId: string,
    @CurrentUserName() userName: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(userId, userName, id, dto);
  }

  @Patch('products/:id/reviews/mine')
  updateMine(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.updateMine(userId, id, dto);
  }

  @Delete('products/:id/reviews/mine')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMine(
    @CurrentUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.reviewsService.deleteMine(userId, id);
  }

  @Get('admin/reviews')
  listAll(
    @Query() query: ListReviewsQueryDto,
  ): Promise<Paginated<AdminReviewResponseDto>> {
    return this.reviewsService.listAll(query);
  }

  @Patch('admin/reviews/:reviewId/status')
  setStatus(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: UpdateReviewStatusDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.setStatus(reviewId, dto.status);
  }
}
