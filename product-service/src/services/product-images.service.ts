import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IProductImageRepository } from '../repositories/product-image.repository';
import {
  PRODUCT_VARIANT_REPOSITORY,
  PRODUCT_IMAGE_REPOSITORY,
} from '../repositories/tokens';
import { ProductImage } from '../db/entities/product-image.entity';

export interface CreateProductImageInput {
  productId: string;
  variantId?: string | null;
  imageUrl: string;
  isThumbnail?: boolean;
  sortOrder?: number;
}

/**
 * Owns `ps_product_images` writes. `variant_id` and `product_id` are independent FKs in
 * the DB schema (Q11) — nothing stops assigning a variant that belongs to a different
 * product, so this service enforces that consistency at the application layer before
 * every create/update.
 */
@Injectable()
export class ProductImagesService {
  constructor(
    @Inject(PRODUCT_VARIANT_REPOSITORY)
    private readonly variantRepository: IProductVariantRepository,
    @Inject(PRODUCT_IMAGE_REPOSITORY)
    private readonly imageRepository: IProductImageRepository,
  ) {}

  async create(input: CreateProductImageInput): Promise<ProductImage> {
    if (input.variantId) {
      await this.assertVariantBelongsToProduct(
        input.productId,
        input.variantId,
      );
    }

    return this.imageRepository.create({
      productId: input.productId,
      variantId: input.variantId ?? null,
      imageUrl: input.imageUrl,
      isThumbnail: input.isThumbnail ?? false,
      sortOrder: input.sortOrder ?? 0,
    });
  }

  /**
   * Throws `BadRequestException` when `variantId` doesn't exist or belongs to a
   * different product than `productId`.
   */
  async assertVariantBelongsToProduct(
    productId: string,
    variantId: string,
  ): Promise<void> {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant) {
      throw new BadRequestException(
        `ProductImage.variantId ${variantId} does not exist`,
      );
    }
    if (variant.productId !== productId) {
      throw new BadRequestException(
        `ProductImage.variantId ${variantId} belongs to product ${variant.productId}, not ${productId}`,
      );
    }
  }
}
