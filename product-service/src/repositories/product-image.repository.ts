import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductImage } from '../db/entities/product-image.entity';

export interface IProductImageRepository {
  findById(id: string): Promise<ProductImage | null>;
  findByProductIds(productIds: string[]): Promise<ProductImage[]>;
  findByProductAndUrl(
    productId: string,
    imageUrl: string,
  ): Promise<ProductImage | null>;
  findByProductAndSortOrder(
    productId: string,
    sortOrder: number,
  ): Promise<ProductImage | null>;
  create(data: Partial<ProductImage>): Promise<ProductImage>;
  update(id: string, data: Partial<ProductImage>): Promise<ProductImage>;
  deleteById(id: string): Promise<void>;
}

@Injectable()
export class TypeOrmProductImageRepository implements IProductImageRepository {
  constructor(
    @InjectRepository(ProductImage)
    private readonly repo: Repository<ProductImage>,
  ) {}

  findById(id: string): Promise<ProductImage | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByProductIds(productIds: string[]): Promise<ProductImage[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return this.repo
      .createQueryBuilder('image')
      .where('image.product_id IN (:...productIds)', { productIds })
      .orderBy('image.sortOrder', 'ASC')
      .getMany();
  }

  findByProductAndUrl(
    productId: string,
    imageUrl: string,
  ): Promise<ProductImage | null> {
    return this.repo.findOne({ where: { productId, imageUrl } });
  }

  findByProductAndSortOrder(
    productId: string,
    sortOrder: number,
  ): Promise<ProductImage | null> {
    return this.repo.findOne({ where: { productId, sortOrder } });
  }

  create(data: Partial<ProductImage>): Promise<ProductImage> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: Partial<ProductImage>): Promise<ProductImage> {
    await this.repo.update({ id }, data);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`ProductImage ${id} not found after update`);
    }
    return updated;
  }

  async deleteById(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
