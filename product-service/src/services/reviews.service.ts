import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { IReviewRepository } from '../repositories/review.repository';
import { IProductRepository } from '../repositories/product.repository';
import { IOrderPurchaseClient } from '../repositories/order-purchase-client.repository';
import {
  ORDER_PURCHASE_CLIENT,
  PRODUCT_REPOSITORY,
  REVIEW_REPOSITORY,
} from '../repositories/tokens';
import { CreateReviewDto } from '../routes/dto/create-review.dto';
import { UpdateReviewDto } from '../routes/dto/update-review.dto';
import { ListReviewsQueryDto } from '../routes/dto/list-reviews-query.dto';
import { PaginationQueryDto } from '../routes/dto/pagination-query.dto';
import {
  AdminReviewResponseDto,
  ReviewResponseDto,
  ReviewSummaryResponseDto,
} from '../routes/dto/review-response.dto';
import { Review } from '../db/entities/review.entity';
import { ProductStatus } from '../db/enums/product-status.enum';
import { ReviewStatus } from '../db/enums/review-status.enum';
import { Paginated, paginated } from '../common/api-response';

const ALREADY_REVIEWED_MESSAGE = 'Bạn đã đánh giá sản phẩm này';
const NOT_PURCHASED_MESSAGE = 'Bạn cần mua sản phẩm này trước khi đánh giá';
const NO_OWN_REVIEW_MESSAGE = 'Bạn chưa đánh giá sản phẩm này';

/**
 * Product reviews by verified buyers (AC4–AC9). Every write runs in one transaction with
 * `recomputeProductRating`, so `ps_products.avg_rating`/`review_count` never lag (AC8).
 */
@Injectable()
export class ReviewsService {
  constructor(
    @Inject(REVIEW_REPOSITORY)
    private readonly reviewRepository: IReviewRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(ORDER_PURCHASE_CLIENT)
    private readonly orderPurchaseClient: IOrderPurchaseClient,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async summary(productId: string): Promise<ReviewSummaryResponseDto> {
    const product =
      await this.productRepository.findByIdWithBrandAndCategory(productId);
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm ${productId}`);
    }
    return this.reviewRepository.summary(productId);
  }

  async listForProduct(
    productId: string,
    { page, limit }: PaginationQueryDto,
  ): Promise<Paginated<ReviewResponseDto>> {
    const { items, total } = await this.reviewRepository.findPublishedPage(
      productId,
      page,
      limit,
    );
    return paginated(
      items.map((review) => this.toResponseDto(review)),
      total,
      page,
      limit,
    );
  }

  async findMine(
    userId: string,
    productId: string,
  ): Promise<ReviewResponseDto | null> {
    const review = await this.reviewRepository.findByProductAndUser(
      productId,
      userId,
    );
    return review ? this.toResponseDto(review) : null;
  }

  async create(
    userId: string,
    userName: string,
    productId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const product =
      await this.productRepository.findByIdWithBrandAndCategory(productId);
    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new NotFoundException(`Không tìm thấy sản phẩm ${productId}`);
    }

    const existing = await this.reviewRepository.findByProductAndUser(
      productId,
      userId,
    );
    if (existing) {
      throw new ConflictException(ALREADY_REVIEWED_MESSAGE);
    }

    // Throws 503 when order-service can't answer (AC12) — nothing is written then.
    const purchased = await this.orderPurchaseClient.hasPurchased(
      userId,
      productId,
    );
    if (!purchased) {
      throw new ForbiddenException(NOT_PURCHASED_MESSAGE);
    }

    try {
      const review = await this.dataSource.transaction(async (manager) => {
        const created = await this.reviewRepository.create(
          {
            productId,
            userId,
            reviewerName: userName,
            rating: dto.rating,
            comment: this.normalizeComment(dto.comment),
            isVerifiedPurchase: true,
            status: ReviewStatus.PUBLISHED,
          },
          manager,
        );
        await this.reviewRepository.recomputeProductRating(productId, manager);
        return created;
      });
      return this.toResponseDto(review);
    } catch (error) {
      // Two concurrent first reviews: the unique (product_id, user_id) wins the race.
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(ALREADY_REVIEWED_MESSAGE);
      }
      throw error;
    }
  }

  async updateMine(
    userId: string,
    productId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    const review = await this.findOwnOrThrow(userId, productId);

    const updateData: Partial<Review> = {};
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.comment !== undefined)
      updateData.comment = this.normalizeComment(dto.comment);

    if (Object.keys(updateData).length > 0) {
      await this.dataSource.transaction(async (manager) => {
        await this.reviewRepository.update(review.id, updateData, manager);
        await this.reviewRepository.recomputeProductRating(productId, manager);
      });
    }

    return this.toResponseDto(await this.findByIdOrThrow(review.id));
  }

  async deleteMine(userId: string, productId: string): Promise<void> {
    const review = await this.findOwnOrThrow(userId, productId);
    await this.dataSource.transaction(async (manager) => {
      await this.reviewRepository.delete(review.id, manager);
      await this.reviewRepository.recomputeProductRating(productId, manager);
    });
  }

  /** Admin moderation list (AC9), optionally filtered by status. */
  async listAll(
    query: ListReviewsQueryDto,
  ): Promise<Paginated<AdminReviewResponseDto>> {
    const { items, total } = await this.reviewRepository.findPage({
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return paginated(
      items.map((review) => ({
        ...this.toResponseDto(review),
        productName: review.product?.name ?? '',
      })),
      total,
      query.page,
      query.limit,
    );
  }

  /** Admin hide/show (AC9); HIDDEN reviews drop out of the product aggregate (AC8). */
  async setStatus(
    id: string,
    status: ReviewStatus,
  ): Promise<ReviewResponseDto> {
    const review = await this.findByIdOrThrow(id);
    if (review.status !== status) {
      await this.dataSource.transaction(async (manager) => {
        await this.reviewRepository.update(id, { status }, manager);
        await this.reviewRepository.recomputeProductRating(
          review.productId,
          manager,
        );
      });
    }
    return this.toResponseDto(await this.findByIdOrThrow(id));
  }

  private async findOwnOrThrow(
    userId: string,
    productId: string,
  ): Promise<Review> {
    const review = await this.reviewRepository.findByProductAndUser(
      productId,
      userId,
    );
    if (!review) {
      throw new NotFoundException(NO_OWN_REVIEW_MESSAGE);
    }
    return review;
  }

  private async findByIdOrThrow(id: string): Promise<Review> {
    const review = await this.reviewRepository.findById(id);
    if (!review) {
      throw new NotFoundException(`Không tìm thấy đánh giá ${id}`);
    }
    return review;
  }

  /** Blank (`""`, whitespace) or missing comment is stored as NULL — web sends "" to clear. */
  private normalizeComment(comment: string | null | undefined): string | null {
    return comment && comment.trim() !== '' ? comment : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    return (error.driverError as { code?: string }).code === '23505';
  }

  private toResponseDto(review: Review): ReviewResponseDto {
    return {
      id: review.id,
      productId: review.productId,
      userId: review.userId,
      reviewerName: review.reviewerName,
      rating: review.rating,
      comment: review.comment,
      isVerifiedPurchase: review.isVerifiedPurchase,
      status: review.status,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
