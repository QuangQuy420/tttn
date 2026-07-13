import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductFaceShape } from '../db/entities/product-face-shape.entity';
import { FaceShape } from '../db/enums/face-shape.enum';

export interface IProductFaceShapeRepository {
  findByProductIds(productIds: string[]): Promise<ProductFaceShape[]>;
  /** Delete-then-insert semantics — replaces the full face-shape tag set for a product. */
  replaceForProduct(
    productId: string,
    faceShapes: FaceShape[],
  ): Promise<ProductFaceShape[]>;
}

@Injectable()
export class TypeOrmProductFaceShapeRepository implements IProductFaceShapeRepository {
  constructor(
    @InjectRepository(ProductFaceShape)
    private readonly repo: Repository<ProductFaceShape>,
  ) {}

  findByProductIds(productIds: string[]): Promise<ProductFaceShape[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return this.repo
      .createQueryBuilder('productFaceShape')
      .where('productFaceShape.product_id IN (:...productIds)', {
        productIds,
      })
      .getMany();
  }

  async replaceForProduct(
    productId: string,
    faceShapes: FaceShape[],
  ): Promise<ProductFaceShape[]> {
    await this.repo.delete({ productId });
    if (faceShapes.length === 0) return [];

    const rows = faceShapes.map((faceShape) =>
      this.repo.create({ productId, faceShape }),
    );
    return this.repo.save(rows);
  }
}
