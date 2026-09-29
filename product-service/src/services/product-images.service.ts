import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IProductImageRepository } from '../repositories/product-image.repository';
import { IImageStorageRepository } from '../repositories/image-storage.repository';
import {
  PRODUCT_VARIANT_REPOSITORY,
  PRODUCT_IMAGE_REPOSITORY,
  IMAGE_STORAGE_REPOSITORY,
} from '../repositories/tokens';
import { ProductImage } from '../db/entities/product-image.entity';
import { ImageKind } from '../db/enums/image-kind.enum';

export interface CreateProductImageInput {
  productId: string;
  variantId?: string | null;
  imageUrl: string;
  isThumbnail?: boolean;
  sortOrder?: number;
  /** Defaults to GALLERY. TRY_ON demotes the product's previous TRY_ON image. */
  kind?: ImageKind;
}

/** First 4 bytes of every PNG file (`\x89PNG`). */
const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47];

const MAX_PRODUCT_IMAGES = 8;
const MAX_VARIANT_IMAGES = 5;

/**
 * Owns `ps_product_images` writes. `variant_id` and `product_id` are independent FKs in
 * the DB schema (Q11) — nothing stops assigning a variant that belongs to a different
 * product, so this service enforces that consistency at the application layer before
 * every create/update.
 */
@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);

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

    const data = {
      productId: input.productId,
      variantId: input.variantId ?? null,
      imageUrl: input.imageUrl,
      isThumbnail: input.isThumbnail ?? false,
      sortOrder: input.sortOrder ?? 0,
    };
    if (input.kind === ImageKind.TRY_ON) {
      return this.imageRepository.createDemotingTryOn(data);
    }
    return this.imageRepository.create({ ...data, kind: ImageKind.GALLERY });
  }

  /**
   * Uploads `file` to object storage and appends it to `productId`'s image list — either
   * the base product's own group (`variantId` null) or a specific variant's group. Never
   * replaces an existing image; `sortOrder` is the current max within the group + 1. The
   * admin picks the thumbnail explicitly afterwards (`setThumbnail`), so a newly uploaded
   * image never starts as the thumbnail.
   *
   * `kind=TRY_ON` must be a PNG (transparent overlay for the try-on) and replaces the
   * product's current TRY_ON image, which is demoted to GALLERY.
   */
  async uploadAndAttach(
    productId: string,
    variantId: string | null,
    file: Express.Multer.File,
    kind: ImageKind = ImageKind.GALLERY,
  ): Promise<ProductImage> {
    if (kind === ImageKind.TRY_ON && !this.isPng(file)) {
      throw new BadRequestException('Ảnh thử kính phải là PNG nền trong suốt');
    }

    const groupImages = (
      await this.imageRepository.findByProductIds([productId])
    ).filter((image) => image.variantId === variantId);

    const maxCount =
      variantId === null ? MAX_PRODUCT_IMAGES : MAX_VARIANT_IMAGES;
    if (groupImages.length >= maxCount) {
      throw new BadRequestException(
        variantId === null
          ? `Sản phẩm đã đạt giới hạn tối đa ${maxCount} ảnh`
          : `Phiên bản đã đạt giới hạn tối đa ${maxCount} ảnh`,
      );
    }

    const sortOrder =
      groupImages.length === 0
        ? 0
        : Math.max(...groupImages.map((image) => image.sortOrder)) + 1;

    const imageUrl = await this.imageStorageRepository.upload({
      buffer: file.buffer,
      key: `${productId}/${variantId ?? 'product'}/${Date.now()}${this.extensionFor(file.mimetype)}`,
      contentType: file.mimetype,
    });

    return this.create({
      productId,
      variantId,
      imageUrl,
      isThumbnail: false,
      sortOrder,
      kind,
    });
  }

  /**
   * Marks `imageId` as the thumbnail and unsets any other `isThumbnail=true` image within
   * the same group (`variantId` null vs. matching) — admin picks the thumbnail explicitly,
   * so at most one image per group is ever marked.
   */
  async setThumbnail(
    productId: string,
    imageId: string,
  ): Promise<ProductImage> {
    const image = await this.findOwnedImage(productId, imageId);

    const groupImages = (
      await this.imageRepository.findByProductIds([productId])
    ).filter(
      (candidate) =>
        candidate.variantId === image.variantId &&
        candidate.id !== image.id &&
        candidate.isThumbnail,
    );
    for (const candidate of groupImages) {
      await this.imageRepository.update(candidate.id, { isThumbnail: false });
    }

    return this.imageRepository.update(imageId, { isThumbnail: true });
  }

  /**
   * Removes `imageId` — 404 if it doesn't exist or doesn't belong to `productId`. The DB row
   * is the source of truth for the catalog, so it's deleted first; the storage object is
   * cleaned up best-effort afterwards — a storage hiccup shouldn't leave a deleted image
   * still showing up in the catalog.
   */
  async remove(productId: string, imageId: string): Promise<void> {
    const image = await this.findOwnedImage(productId, imageId);
    await this.imageRepository.deleteById(imageId);

    try {
      await this.imageStorageRepository.deleteByUrl(image.imageUrl);
    } catch (error) {
      this.logger.warn(
        `Failed to delete storage object for image ${imageId} (${image.imageUrl}): ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async findOwnedImage(
    productId: string,
    imageId: string,
  ): Promise<ProductImage> {
    const image = await this.imageRepository.findById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException(
        `Không tìm thấy ảnh ${imageId} của sản phẩm ${productId}`,
      );
    }
    return image;
  }

  /** Checks both the declared MIME type and the PNG magic bytes of the content. */
  private isPng(file: Express.Multer.File): boolean {
    return (
      file.mimetype === 'image/png' &&
      file.buffer.length >= PNG_MAGIC_BYTES.length &&
      PNG_MAGIC_BYTES.every((byte, index) => file.buffer[index] === byte)
    );
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
        `ProductImage.variantId ${variantId} không tồn tại`,
      );
    }
    if (variant.productId !== productId) {
      throw new BadRequestException(
        `ProductImage.variantId ${variantId} thuộc về sản phẩm ${variant.productId}, không phải ${productId}`,
      );
    }
  }
}
