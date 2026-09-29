import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { WishlistItem } from '../db/entities/wishlist-item.entity';
import { ProductStatus } from '../db/enums/product-status.enum';

export interface IWishlistRepository {
  /**
   * `INSERT … ON CONFLICT DO NOTHING` on (user_id, product_id) — returns `true` only when a
   * new row was inserted, so a repeated like is a safe no-op (AC1).
   */
  add(
    userId: string,
    productId: string,
    manager?: EntityManager,
  ): Promise<boolean>;
  /** Returns `true` if a row was deleted. */
  remove(
    userId: string,
    productId: string,
    manager?: EntityManager,
  ): Promise<boolean>;
  /**
   * One page (1-based) of the user's liked product ids, newest like first, restricted to
   * PUBLISHED non-deleted products so `total` matches what the caller can hydrate (AC2).
   */
  findPublishedProductIdsPage(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ productIds: string[]; total: number }>;
  /** Every product id the user has liked (used to paint the ❤ state). */
  findProductIds(userId: string): Promise<string[]>;
}

@Injectable()
export class TypeOrmWishlistRepository implements IWishlistRepository {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly repo: Repository<WishlistItem>,
  ) {}

  async add(
    userId: string,
    productId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(WishlistItem) : this.repo;
    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(WishlistItem)
      .values({ userId, productId })
      .orIgnore()
      .returning('id')
      .execute();
    return (result.raw as unknown[]).length > 0;
  }

  async remove(
    userId: string,
    productId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(WishlistItem) : this.repo;
    const result = await repo.delete({ userId, productId });
    return (result.affected ?? 0) > 0;
  }

  async findPublishedProductIdsPage(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ productIds: string[]; total: number }> {
    const [items, total] = await this.repo
      .createQueryBuilder('item')
      .innerJoin('item.product', 'product')
      .where('item.user_id = :userId', { userId })
      .andWhere('product.status = :status', {
        status: ProductStatus.PUBLISHED,
      })
      .andWhere('product.deleted_at IS NULL')
      .orderBy('item.createdAt', 'DESC')
      .addOrderBy('item.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();
    return { productIds: items.map((item) => item.productId), total };
  }

  async findProductIds(userId: string): Promise<string[]> {
    const items = await this.repo.find({
      select: { productId: true },
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return items.map((item) => item.productId);
  }
}
