import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductImage } from '../db/entities/product-image.entity';

export interface IProductImageRepository {
  findByProductIds(productIds: string[]): Promise<ProductImage[]>;
  findByProductAndUrl(
    productId: string,
    imageUrl: string,
  ): Promise<ProductImage | null>;
  create(data: Partial<ProductImage>): Promise<ProductImage>;
}

@Injectable()
export class TypeOrmProductImageRepository implements IProductImageRepository {
  constructor(
    @InjectRepository(ProductImage)
    private readonly repo: Repository<ProductImage>,
  ) {}

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

  create(data: Partial<ProductImage>): Promise<ProductImage> {
    return this.repo.save(this.repo.create(data));
  }
}
