import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Review } from '../db/entities/review.entity';
import { ReviewStatus } from '../db/enums/review-status.enum';

export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export interface ReviewSummary {
  avgRating: number;
  reviewCount: number;
  distribution: RatingDistribution;
}

export interface ReviewListFilter {
  status?: ReviewStatus;
  page: number;
  limit: number;
}

export interface IReviewRepository {
  findById(id: string): Promise<Review | null>;
  findByProductAndUser(
    productId: string,
    userId: string,
  ): Promise<Review | null>;
  /** One page (1-based) of a product's PUBLISHED reviews, newest first (AC4). */
  findPublishedPage(
    productId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Review[]; total: number }>;
  /** Admin moderation list (AC9), newest first, with `product` loaded for its name. */
  findPage(
    filter: ReviewListFilter,
  ): Promise<{ items: Review[]; total: number }>;
  create(data: Partial<Review>, manager?: EntityManager): Promise<Review>;
  update(
    id: string,
    data: Partial<Review>,
    manager?: EntityManager,
  ): Promise<void>;
  delete(id: string, manager?: EntityManager): Promise<void>;
  /**
   * Rewrites `ps_products.avg_rating`/`review_count` from the product's PUBLISHED reviews
   * (AC8). Called inside the same transaction as every review write.
   */
  recomputeProductRating(
    productId: string,
    manager?: EntityManager,
  ): Promise<void>;
  /** AVG/COUNT + per-star counts over the product's PUBLISHED reviews (AC4). */
  summary(productId: string): Promise<ReviewSummary>;
}

@Injectable()
export class TypeOrmReviewRepository implements IReviewRepository {
  constructor(
    @InjectRepository(Review) private readonly repo: Repository<Review>,
  ) {}

  findById(id: string): Promise<Review | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByProductAndUser(
    productId: string,
    userId: string,
  ): Promise<Review | null> {
    return this.repo.findOne({ where: { productId, userId } });
  }

  async findPublishedPage(
    productId: string,
    page: number,
    limit: number,
  ): Promise<{ items: Review[]; total: number }> {
    const [items, total] = await this.repo.findAndCount({
      where: { productId, status: ReviewStatus.PUBLISHED },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async findPage(
    filter: ReviewListFilter,
  ): Promise<{ items: Review[]; total: number }> {
    const qb = this.repo
      .createQueryBuilder('review')
      // withDeleted: a soft-deleted product keeps its reviews; admins still see its name.
      .withDeleted()
      .innerJoinAndSelect('review.product', 'product');

    if (filter.status) {
      qb.where('review.status = :status', { status: filter.status });
    }

    const [items, total] = await qb
      .orderBy('review.createdAt', 'DESC')
      .addOrderBy('review.id', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getManyAndCount();
    return { items, total };
  }

  create(data: Partial<Review>, manager?: EntityManager): Promise<Review> {
    const repo = manager ? manager.getRepository(Review) : this.repo;
    return repo.save(repo.create(data));
  }

  async update(
    id: string,
    data: Partial<Review>,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Review) : this.repo;
    await repo.update({ id }, data);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(Review) : this.repo;
    await repo.delete({ id });
  }

  async recomputeProductRating(
    productId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.repo.manager;
    await runner.query(
      `UPDATE "ps_products" SET
         "avg_rating" = COALESCE((SELECT AVG("rating") FROM "ps_reviews" WHERE "product_id" = $1 AND "status" = $2), 0),
         "review_count" = (SELECT COUNT(*) FROM "ps_reviews" WHERE "product_id" = $1 AND "status" = $2)
       WHERE "id" = $1`,
      [productId, ReviewStatus.PUBLISHED],
    );
  }

  async summary(productId: string): Promise<ReviewSummary> {
    const [totals, rows] = await Promise.all([
      this.repo
        .createQueryBuilder('review')
        .select('COALESCE(ROUND(AVG(review.rating), 2), 0)', 'avgRating')
        .addSelect('COUNT(*)', 'reviewCount')
        .where('review.product_id = :productId', { productId })
        .andWhere('review.status = :status', {
          status: ReviewStatus.PUBLISHED,
        })
        .getRawOne<{ avgRating: string; reviewCount: string }>(),
      this.repo
        .createQueryBuilder('review')
        .select('review.rating', 'rating')
        .addSelect('COUNT(*)', 'count')
        .where('review.product_id = :productId', { productId })
        .andWhere('review.status = :status', {
          status: ReviewStatus.PUBLISHED,
        })
        .groupBy('review.rating')
        .getRawMany<{ rating: number; count: string }>(),
    ]);

    const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of rows) {
      distribution[Number(row.rating) as keyof RatingDistribution] = Number(
        row.count,
      );
    }

    return {
      avgRating: Number(totals?.avgRating ?? 0),
      reviewCount: Number(totals?.reviewCount ?? 0),
      distribution,
    };
  }
}
