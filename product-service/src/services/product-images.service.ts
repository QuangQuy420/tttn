import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IProductImageRepository } from '../repositories/product-image.repository';
import { IImageStorageRepository } from '../repositories/image-storage.repository';
import {
  PRODUCT_VARIANT_REPOSITORY,
  PRODUCT_IMAGE_REPOSITORY,
  IMAGE_STORAGE_REPOSITORY,
} from '../repositories/tokens';
import { ProductImage } from '../db/entities/product-image.entity';

export interface CreateProductImageInput {
  productId: string;
  variantId?: string | null;
  imageUrl: string;
  isThumbnail?: boolean;
  sortOrder?: number;
}

export type ImageSlot = 'main' | 'angle1' | 'angle2' | 'angle3';

const SLOT_SORT_ORDER: Record<ImageSlot, number> = {
  main: 0,
  angle1: 1,
  angle2: 2,
  angle3: 3,
};

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
    @Inject(IMAGE_STORAGE_REPOSITORY)
    private readonly imageStorageRepository: IImageStorageRepository,
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
   * Uploads `file` to object storage and attaches it to `productId` at `slot`'s
   * `sortOrder` (main=0/angle1=1/angle2=2/angle3=3), replacing (not duplicating) any
   * existing image already in that slot (T11).
   */
  async uploadAndAttach(
    productId: string,
    slot: ImageSlot,
    file: Express.Multer.File,
  ): Promise<ProductImage> {
    const sortOrder = SLOT_SORT_ORDER[slot];

    const imageUrl = await this.imageStorageRepository.upload({
      buffer: file.buffer,
      key: `${productId}/${slot}-${Date.now()}${this.extensionFor(file.mimetype)}`,
      contentType: file.mimetype,
    });

    const existing = await this.imageRepository.findByProductAndSortOrder(
      productId,
      sortOrder,
    );
    if (existing) {
      await this.imageRepository.deleteById(existing.id);
    }

    return this.create({
      productId,
      imageUrl,
      isThumbnail: slot === 'main',
      sortOrder,
    });
  }

  private extensionFor(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      default:
        return '';
    }
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
