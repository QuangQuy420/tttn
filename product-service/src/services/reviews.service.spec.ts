import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ReviewsService } from './reviews.service';
import { IReviewRepository } from '../repositories/review.repository';
import { IProductRepository } from '../repositories/product.repository';
import { IOrderPurchaseClient } from '../repositories/order-purchase-client.repository';
import { Review } from '../db/entities/review.entity';
import { ProductStatus } from '../db/enums/product-status.enum';
import { ReviewStatus } from '../db/enums/review-status.enum';

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: 'review-1',
    productId: 'product-1',
    userId: 'user-1',
    reviewerName: 'alice',
    rating: 5,
    comment: 'Great',
    isVerifiedPurchase: true,
    status: ReviewStatus.PUBLISHED,
    createdAt: new Date('2026-09-29T00:00:00Z'),
    updatedAt: new Date('2026-09-29T00:00:00Z'),
    ...overrides,
  };
}

describe('ReviewsService.create', () => {
  const manager = {} as EntityManager;
  let reviewRepository: jest.Mocked<IReviewRepository>;
  let productRepository: jest.Mocked<
    Pick<IProductRepository, 'findByIdWithBrandAndCategory'>
  >;
  let orderPurchaseClient: jest.Mocked<IOrderPurchaseClient>;
  let dataSource: { transaction: jest.Mock };
  let service: ReviewsService;

  beforeEach(() => {
    reviewRepository = {
      findById: jest.fn(),
      findByProductAndUser: jest.fn(),
      findPublishedPage: jest.fn(),
      findPage: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      lockProduct: jest.fn(),
      recomputeProductRating: jest.fn(),
      summary: jest.fn(),
    };
    productRepository = {
      findByIdWithBrandAndCategory: jest.fn().mockResolvedValue({
        id: 'product-1',
        status: ProductStatus.PUBLISHED,
      }),
    };
    orderPurchaseClient = { hasPurchased: jest.fn() };
    dataSource = {
      transaction: jest.fn((work: (m: EntityManager) => Promise<unknown>) =>
        work(manager),
      ),
    };
    service = new ReviewsService(
      reviewRepository,
      productRepository as unknown as IProductRepository,
      orderPurchaseClient,
      dataSource as unknown as DataSource,
    );
    reviewRepository.findByProductAndUser.mockResolvedValue(null);
  });

  it('creates a verified-purchase review and recomputes the rating in the same transaction (AC6, AC8)', async () => {
    orderPurchaseClient.hasPurchased.mockResolvedValue(true);
    reviewRepository.create.mockResolvedValue(makeReview());

    const result = await service.create('user-1', 'alice', 'product-1', {
      rating: 5,
      comment: 'Great',
    });

    expect(orderPurchaseClient.hasPurchased).toHaveBeenCalledWith(
      'user-1',
      'product-1',
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(reviewRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        userId: 'user-1',
        reviewerName: 'alice',
        rating: 5,
        comment: 'Great',
        isVerifiedPurchase: true,
        status: ReviewStatus.PUBLISHED,
      }),
      manager,
    );
    expect(reviewRepository.recomputeProductRating).toHaveBeenCalledWith(
      'product-1',
      manager,
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'review-1',
        isVerifiedPurchase: true,
        rating: 5,
      }),
    );
  });

  it('throws 403 when the user has not purchased the product (AC5)', async () => {
    orderPurchaseClient.hasPurchased.mockResolvedValue(false);

    await expect(
      service.create('user-1', 'alice', 'product-1', { rating: 4 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  it('throws 409 when the user already reviewed the product (AC7)', async () => {
    reviewRepository.findByProductAndUser.mockResolvedValue(makeReview());

    await expect(
      service.create('user-1', 'alice', 'product-1', { rating: 4 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  it('propagates 503 when order-service is down and writes nothing (AC12)', async () => {
    orderPurchaseClient.hasPurchased.mockRejectedValue(
      new ServiceUnavailableException('down'),
    );

    await expect(
      service.create('user-1', 'alice', 'product-1', { rating: 4 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(reviewRepository.create).not.toHaveBeenCalled();
    expect(reviewRepository.recomputeProductRating).not.toHaveBeenCalled();
  });

  it('returns 404 for the review list of a DRAFT product unless includeAllStatuses is set (AC20)', async () => {
    productRepository.findByIdWithBrandAndCategory.mockResolvedValue({
      id: 'product-1',
      status: ProductStatus.DRAFT,
    } as never);
    reviewRepository.findPublishedPage.mockResolvedValue({
      items: [makeReview()],
      total: 1,
    });

    await expect(
      service.listForProduct('product-1', { page: 1, limit: 10 }),
    ).rejects.toThrow(
      new NotFoundException('Không tìm thấy sản phẩm product-1'),
    );
    expect(reviewRepository.findPublishedPage).not.toHaveBeenCalled();

    const result = await service.listForProduct('product-1', {
      page: 1,
      limit: 10,
      includeAllStatuses: true,
    });
    expect(result.items).toHaveLength(1);
  });

  it('returns 404 for the review list of a product that does not exist (AC20)', async () => {
    productRepository.findByIdWithBrandAndCategory.mockResolvedValue(null);

    await expect(
      service.listForProduct('missing', { page: 1, limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reviewRepository.findPublishedPage).not.toHaveBeenCalled();
  });

  it('forbids the owner from editing or deleting a HIDDEN review (AC28)', async () => {
    reviewRepository.findByProductAndUser.mockResolvedValue(
      makeReview({ status: ReviewStatus.HIDDEN }),
    );
    const hiddenError = new ForbiddenException(
      'Đánh giá của bạn đã bị ẩn bởi quản trị viên nên không thể sửa hoặc xoá',
    );

    await expect(
      service.updateMine('user-1', 'product-1', { rating: 1 }),
    ).rejects.toThrow(hiddenError);
    await expect(service.deleteMine('user-1', 'product-1')).rejects.toThrow(
      hiddenError,
    );
    expect(reviewRepository.update).not.toHaveBeenCalled();
    expect(reviewRepository.delete).not.toHaveBeenCalled();
  });
});
