import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../db/entities/product.entity';
import { FrameShape } from '../db/enums/frame-shape.enum';
import { GenderTarget } from '../db/enums/gender-target.enum';
import { ProductStatus } from '../db/enums/product-status.enum';
import { FaceShape } from '../db/enums/face-shape.enum';
import { MaterialType } from '../db/enums/material-type.enum';

export type ProductSort = 'newest' | 'price_asc' | 'price_desc';

export interface ProductListFilter {
  categoryId?: string;
  brandId?: string;
  brandIds?: string[];
  materialType?: MaterialType;
  /** Any non-deleted variant with this color, case-insensitive. */
  color?: string;
  frameShape?: FrameShape;
  genderTarget?: GenderTarget;
  faceShape?: FaceShape;
  status?: ProductStatus;
  includeAllStatuses?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  /** Defaults to `newest`. */
  sort?: ProductSort;
  page: number;
  limit: number;
}

export interface ProductListResult {
  items: Product[];
  total: number;
}

export interface IProductRepository {
  /**
   * Filters + paginates over `ps_products` only (no one-to-many joins here — joining
   * variants/images directly would multiply/paginate incorrectly). Callers hydrate
   * variants/images separately by product id.
   */
  findAndCount(filter: ProductListFilter): Promise<ProductListResult>;
  findByIdWithBrandAndCategory(id: string): Promise<Product | null>;
  findBySlugWithBrandAndCategory(slug: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findBySlug(slug: string): Promise<Product | null>;
  create(data: Partial<Product>): Promise<Product>;
  update(id: string, data: Partial<Product>): Promise<Product>;
  /** Soft delete — sets `deleted_at` via TypeORM's built-in `softDelete()` (AC4, NFR4). */
  softDelete(id: string): Promise<void>;
  /** Hard delete — only used by the seed runner to roll back a partially-seeded product. */
  deleteById(id: string): Promise<void>;
}

@Injectable()
export class TypeOrmProductRepository implements IProductRepository {
  constructor(
    @InjectRepository(Product) private readonly repo: Repository<Product>,
  ) {}

  async findAndCount(filter: ProductListFilter): Promise<ProductListResult> {
    const qb = this.repo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.category', 'category');

    if (filter.categoryId) {
      qb.andWhere('product.category_id = :categoryId', {
        categoryId: filter.categoryId,
      });
    }
    if (filter.brandId) {
      qb.andWhere('product.brand_id = :brandId', { brandId: filter.brandId });
    }
    if (filter.brandIds && filter.brandIds.length > 0) {
      qb.andWhere('product.brand_id IN (:...brandIds)', {
        brandIds: filter.brandIds,
      });
    }
    if (filter.materialType) {
      qb.andWhere('product.material_type = :materialType', {
        materialType: filter.materialType,
      });
    }
    if (filter.color) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM ps_product_variants v WHERE v.product_id = product.id AND v.deleted_at IS NULL AND lower(v.color) = lower(:color))',
        { color: filter.color },
      );
    }
    if (filter.frameShape) {
      qb.andWhere('product.frame_shape = :frameShape', {
        frameShape: filter.frameShape,
      });
    }
    if (filter.genderTarget) {
      qb.andWhere('product.gender_target = :genderTarget', {
        genderTarget: filter.genderTarget,
      });
    }
    if (filter.faceShape) {
      qb.andWhere(
        'product.face_shapes @> ARRAY[:faceShape]::ps_face_shape_enum[]',
        { faceShape: filter.faceShape },
      );
    }
    if (filter.status) {
      qb.andWhere('product.status = :status', { status: filter.status });
    } else if (!filter.includeAllStatuses) {
      qb.andWhere('product.status = :status', {
        status: ProductStatus.PUBLISHED,
      });
    }
    if (filter.minPrice !== undefined) {
      qb.andWhere('product.base_price >= :minPrice', {
        minPrice: filter.minPrice,
      });
    }
    if (filter.maxPrice !== undefined) {
      qb.andWhere('product.base_price <= :maxPrice', {
        maxPrice: filter.maxPrice,
      });
    }
    if (filter.search) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${filter.search}%`,
      });
    }

    switch (filter.sort) {
      case 'price_asc':
        qb.orderBy('product.basePrice', 'ASC').addOrderBy(
          'product.createdAt',
          'DESC',
        );
        break;
      case 'price_desc':
        qb.orderBy('product.basePrice', 'DESC').addOrderBy(
          'product.createdAt',
          'DESC',
        );
        break;
      default:
        qb.orderBy('product.createdAt', 'DESC');
    }

    qb.skip((filter.page - 1) * filter.limit).take(filter.limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  findByIdWithBrandAndCategory(id: string): Promise<Product | null> {
    return this.repo.findOne({
      where: { id },
      relations: ['brand', 'category'],
    });
  }

  findBySlugWithBrandAndCategory(slug: string): Promise<Product | null> {
    return this.repo.findOne({
      where: { slug },
      relations: ['brand', 'category'],
    });
  }

  findBySku(sku: string): Promise<Product | null> {
    // withDeleted: the UNIQUE(sku) constraint isn't relaxed for soft-deleted rows, so a
    // soft-deleted product still occupies its sku — excluding it here would let callers
    // (seed idempotency check, admin-form sku generator) collide with it and 500 on insert.
    return this.repo.findOne({ where: { sku }, withDeleted: true });
  }

  findBySlug(slug: string): Promise<Product | null> {
    return this.repo.findOne({ where: { slug } });
  }

  create(data: Partial<Product>): Promise<Product> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: Partial<Product>): Promise<Product> {
    await this.repo.update({ id }, data);
    const updated = await this.findByIdWithBrandAndCategory(id);
    if (!updated) {
      throw new Error(`Product ${id} not found after update`);
    }
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete({ id });
  }

  async deleteById(id: string): Promise<void> {
    // Hard delete (bypassing soft-delete) — the row being rolled back was never a real
    // published product to begin with.
    await this.repo.delete({ id });
  }
}
