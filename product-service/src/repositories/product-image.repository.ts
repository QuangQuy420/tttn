import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductImage } from '../db/entities/product-image.entity';
import { ImageKind } from '../db/enums/image-kind.enum';

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
  /**
   * Inserts `data` as the product's TRY_ON image and, in the same transaction, demotes the
   * product's current TRY_ON image (if any) to GALLERY — keeps "one TRY_ON per product"
   * (partial unique index `UQ_ps_product_images_try_on`) without a window where it breaks.
   */
  createDemotingTryOn(data: Partial<ProductImage>): Promise<ProductImage>;
  update(id: string, data: Partial<ProductImage>): Promise<ProductImage>;
  deleteById(id: string): Promise<void>;
}

@Injectable()
export class TypeOrmProductImageRepository implements IProductImageRepository {
  constructor(
    @InjectRepository(ProductImage)
    private readonly repo: Repository<ProductImage>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

  createDemotingTryOn(data: Partial<ProductImage>): Promise<ProductImage> {
    return this.dataSource.transaction(async (manager) => {
      await manager.update(
        ProductImage,
        { productId: data.productId, kind: ImageKind.TRY_ON },
        { kind: ImageKind.GALLERY },
      );
      return manager.save(
        ProductImage,
        manager.create(ProductImage, { ...data, kind: ImageKind.TRY_ON }),
      );
    });
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
