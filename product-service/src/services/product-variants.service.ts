import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { QueryFailedError } from 'typeorm';
import { IProductRepository } from '../repositories/product.repository';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IInventoryRepository } from '../repositories/inventory.repository';
import { IProductEventPublisher } from '../repositories/product-event-publisher.repository';
import { IStockReservationRepository } from '../repositories/stock-reservation.repository';
import {
  PRODUCT_REPOSITORY,
  PRODUCT_VARIANT_REPOSITORY,
  INVENTORY_REPOSITORY,
  PRODUCT_EVENT_PUBLISHER,
  STOCK_RESERVATION_REPOSITORY,
} from '../repositories/tokens';
import { CreateVariantDto } from '../routes/dto/create-variant.dto';
import { UpdateVariantDto } from '../routes/dto/update-variant.dto';
import { ProductVariantResponseDto } from '../routes/dto/product-response.dto';
import { ProductVariant } from '../db/entities/product-variant.entity';

const COLOR_SIZE_UNIQUE_INDEX =
  'UQ_ps_product_variants_product_color_size_active';

const VARIANT_IN_USE_MESSAGE =
  'Không thể xoá phiên bản vì đang có đơn hàng giữ hàng. Vui lòng thử lại sau khi đơn được xử lý.';

/**
 * Owns `ps_product_variants`, including the variant's stock quantities. A variant without a
 * stock quantity isn't a meaningful admin concept here, so create/update take a single `stock`
 * field rather than exposing inventory as a separate admin resource.
 */
@Injectable()
export class ProductVariantsService {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY)
    private readonly variantRepository: IProductVariantRepository,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepository: IInventoryRepository,
    @Inject(PRODUCT_EVENT_PUBLISHER)
    private readonly eventPublisher: IProductEventPublisher,
    @Inject(STOCK_RESERVATION_REPOSITORY)
    private readonly stockReservationRepository: IStockReservationRepository,
  ) {}

  async create(
    productId: string,
    dto: CreateVariantDto,
  ): Promise<ProductVariantResponseDto> {
    const product =
      await this.productRepository.findByIdWithBrandAndCategory(productId);
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm ${productId}`);
    }

    await this.assertNoDuplicateColorSize(productId, dto.color, dto.size);

    const skuVariant = await this.generateUniqueSkuVariant(product.sku);
    let variant: ProductVariant;
    try {
      variant = await this.variantRepository.create({
        productId,
        color: dto.color,
        colorHex: dto.colorHex,
        size: dto.size,
        extraPrice: dto.extraPrice ?? 0,
        skuVariant,
        quantity: dto.stock ?? 0,
        reservedQuantity: 0,
      });
    } catch (error) {
      // A concurrent create won the race past the pre-check.
      throw this.toDuplicateConflict(error, dto.color, dto.size);
    }

    await this.eventPublisher.publish({ type: 'product.updated', productId });

    return this.toDto(variant, variant.quantity - variant.reservedQuantity);
  }

  async update(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<ProductVariantResponseDto> {
    const variant = await this.findOwnedVariant(productId, variantId);

    if (dto.color !== undefined || dto.size !== undefined) {
      await this.assertNoDuplicateColorSize(
        productId,
        dto.color ?? variant.color,
        dto.size ?? variant.size,
        variantId,
      );
    }

    const updateData: Partial<ProductVariant> = {};
    if (dto.color !== undefined) updateData.color = dto.color;
    if (dto.colorHex !== undefined) updateData.colorHex = dto.colorHex;
    if (dto.size !== undefined) updateData.size = dto.size;
    if (dto.extraPrice !== undefined) updateData.extraPrice = dto.extraPrice;

    let updated = variant;
    if (Object.keys(updateData).length > 0) {
      try {
        updated = await this.variantRepository.update(variantId, updateData);
      } catch (error) {
        throw this.toDuplicateConflict(
          error,
          dto.color ?? variant.color,
          dto.size ?? variant.size,
        );
      }
    }

    // `stock` is the new *available* stock; the repository keeps held reservations on top.
    if (dto.stock !== undefined) {
      await this.inventoryRepository.setAvailable(variantId, dto.stock);
    }

    await this.eventPublisher.publish({ type: 'product.updated', productId });

    // Always re-read rather than echoing `dto.stock` back — `stock` (everywhere else in this
    // app) means *available* (quantity - reservedQuantity), which only equals the quantity
    // just written when the variant has no active reservation.
    const stock = await this.currentStock(variantId);
    return this.toDto(updated, stock);
  }

  async remove(productId: string, variantId: string): Promise<void> {
    await this.findOwnedVariant(productId, variantId);
    // A held reservation would later fail to commit against a soft-deleted variant.
    if (
      await this.stockReservationRepository.hasReservedForVariant(variantId)
    ) {
      throw new ConflictException(VARIANT_IN_USE_MESSAGE);
    }
    await this.variantRepository.softDelete(variantId);

    await this.eventPublisher.publish({ type: 'product.updated', productId });
  }

  private async findOwnedVariant(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException(
        `Không tìm thấy phiên bản ${variantId} của sản phẩm ${productId}`,
      );
    }
    return variant;
  }

  /** `excludeVariantId` so updating a variant without changing color/size doesn't collide with itself. */
  private async assertNoDuplicateColorSize(
    productId: string,
    color: string,
    size: string,
    excludeVariantId?: string,
  ): Promise<void> {
    const siblings = await this.variantRepository.findByProductIds([productId]);
    const collision = siblings.find(
      (candidate) =>
        candidate.id !== excludeVariantId &&
        candidate.color === color &&
        candidate.size === size,
    );
    if (collision) {
      throw new ConflictException(this.duplicateColorSizeMessage(color, size));
    }
  }

  private duplicateColorSizeMessage(color: string, size: string): string {
    return `Sản phẩm đã có phiên bản màu "${color}", kích thước "${size}"`;
  }

  /**
   * 23505 → 409: the color/size index gets its specific message, any other unique index
   * (e.g. `sku_variant`) a generic one; any other error is returned unchanged.
   */
  private toDuplicateConflict(
    error: unknown,
    color: string,
    size: string,
  ): unknown {
    if (!(error instanceof QueryFailedError)) return error;
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    if (driverError.code !== '23505') return error;
    if (driverError.constraint === COLOR_SIZE_UNIQUE_INDEX) {
      return new ConflictException(this.duplicateColorSizeMessage(color, size));
    }
    return new ConflictException(
      'Phiên bản bị trùng với dữ liệu vừa được tạo cùng lúc, vui lòng thử lại.',
    );
  }

  /** Mirrors ProductsService.generateUniqueSku — short random code, prefixed by the parent product's sku. */
  private async generateUniqueSkuVariant(productSku: string): Promise<string> {
    let skuVariant: string;
    do {
      skuVariant = `${productSku}-${randomBytes(3).toString('hex').toUpperCase()}`;
    } while (await this.variantRepository.findBySkuVariant(skuVariant));
    return skuVariant;
  }

  private async currentStock(variantId: string): Promise<number> {
    const stockByVariantId =
      await this.inventoryRepository.findAvailableByVariantIds([variantId]);
    return stockByVariantId.get(variantId) ?? 0;
  }

  private toDto(
    variant: ProductVariant,
    stock: number,
  ): ProductVariantResponseDto {
    const dto = new ProductVariantResponseDto();
    dto.id = variant.id;
    dto.color = variant.color;
    dto.colorHex = variant.colorHex;
    dto.size = variant.size;
    dto.extraPrice = variant.extraPrice;
    dto.skuVariant = variant.skuVariant;
    dto.stock = stock;
    return dto;
  }
}
