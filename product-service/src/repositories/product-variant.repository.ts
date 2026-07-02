import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductVariant } from '../db/entities/product-variant.entity';

export interface IProductVariantRepository {
  findById(id: string): Promise<ProductVariant | null>;
  findBySkuVariant(skuVariant: string): Promise<ProductVariant | null>;
  findByProductIds(productIds: string[]): Promise<ProductVariant[]>;
  create(data: Partial<ProductVariant>): Promise<ProductVariant>;
}

@Injectable()
export class TypeOrmProductVariantRepository implements IProductVariantRepository {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly repo: Repository<ProductVariant>,
  ) {}

  findById(id: string): Promise<ProductVariant | null> {
    return this.repo.findOne({ where: { id } });
  }

  findBySkuVariant(skuVariant: string): Promise<ProductVariant | null> {
    return this.repo.findOne({ where: { skuVariant } });
  }

  findByProductIds(productIds: string[]): Promise<ProductVariant[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return this.repo
      .createQueryBuilder('variant')
      .where('variant.product_id IN (:...productIds)', { productIds })
      .orderBy('variant.color', 'ASC')
      .addOrderBy('variant.size', 'ASC')
      .getMany();
  }

  create(data: Partial<ProductVariant>): Promise<ProductVariant> {
    return this.repo.save(this.repo.create(data));
  }
}
