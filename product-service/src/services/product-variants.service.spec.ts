import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ProductVariantsService } from './product-variants.service';
import { IProductRepository } from '../repositories/product.repository';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IInventoryRepository } from '../repositories/inventory.repository';
import { IProductEventPublisher } from '../repositories/product-event-publisher.repository';
import { IStockReservationRepository } from '../repositories/stock-reservation.repository';
import { ProductVariant } from '../db/entities/product-variant.entity';

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'variant-1',
    productId: 'product-1',
    color: 'Black',
    colorHex: '#000000',
    size: 'M',
    extraPrice: 0,
    skuVariant: 'SKU-1-ABC123',
    quantity: 10,
    reservedQuantity: 3,
    ...overrides,
  } as ProductVariant;
}

describe('ProductVariantsService', () => {
  let productRepository: { findByIdWithBrandAndCategory: jest.Mock };
  let variantRepository: jest.Mocked<IProductVariantRepository>;
  let inventoryRepository: jest.Mocked<IInventoryRepository>;
  let eventPublisher: jest.Mocked<IProductEventPublisher>;
  let stockReservationRepository: { hasReservedForVariant: jest.Mock };
  let service: ProductVariantsService;

  beforeEach(() => {
    productRepository = {
      findByIdWithBrandAndCategory: jest
        .fn()
        .mockResolvedValue({ id: 'product-1', sku: 'SKU-1' }),
    };
    variantRepository = {
      findById: jest.fn().mockResolvedValue(makeVariant()),
      findBySkuVariant: jest.fn().mockResolvedValue(null),
      findByProductIds: jest.fn().mockResolvedValue([makeVariant()]),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    inventoryRepository = {
      reserve: jest.fn(),
      release: jest.fn(),
      commit: jest.fn(),
      restock: jest.fn(),
      findAvailableByVariantIds: jest
        .fn()
        .mockResolvedValue(new Map([['variant-1', 7]])),
      setAvailable: jest.fn(),
    };
    eventPublisher = { publish: jest.fn() };
    stockReservationRepository = {
      hasReservedForVariant: jest.fn().mockResolvedValue(false),
    };
    service = new ProductVariantsService(
      productRepository as unknown as IProductRepository,
      variantRepository,
      inventoryRepository,
      eventPublisher,
      stockReservationRepository as unknown as IStockReservationRepository,
    );
  });

  describe('update', () => {
    it('leaves stock untouched when only price/color change, and writes `stock` as available stock (AC19)', async () => {
      variantRepository.update.mockResolvedValue(
        makeVariant({ extraPrice: 50000 }),
      );

      await service.update('product-1', 'variant-1', { extraPrice: 50000 });
      expect(inventoryRepository.setAvailable).not.toHaveBeenCalled();

      await service.update('product-1', 'variant-1', { stock: 7 });
      expect(inventoryRepository.setAvailable).toHaveBeenCalledTimes(1);
      expect(inventoryRepository.setAvailable).toHaveBeenCalledWith(
        'variant-1',
        7,
      );
    });
  });

  describe('create', () => {
    it('maps a unique violation from a concurrent create to 409 (AC22)', async () => {
      variantRepository.findByProductIds.mockResolvedValue([]);
      variantRepository.create.mockRejectedValue(
        new QueryFailedError('INSERT', [], {
          code: '23505',
          constraint: 'UQ_ps_product_variants_product_color_size_active',
        } as unknown as Error),
      );

      await expect(
        service.create('product-1', { color: 'Black', size: 'M' } as never),
      ).rejects.toThrow(
        new ConflictException(
          'Sản phẩm đã có phiên bản màu "Black", kích thước "M"',
        ),
      );
      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });

    it('rejects a duplicate color/size of a live sibling with 409', async () => {
      await expect(
        service.create('product-1', { color: 'Black', size: 'M' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(variantRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('returns 409 when an order still holds stock of the variant (AC23)', async () => {
      stockReservationRepository.hasReservedForVariant.mockResolvedValue(true);

      await expect(service.remove('product-1', 'variant-1')).rejects.toThrow(
        new ConflictException(
          'Không thể xoá phiên bản vì đang có đơn hàng giữ hàng. Vui lòng thử lại sau khi đơn được xử lý.',
        ),
      );
      expect(
        stockReservationRepository.hasReservedForVariant,
      ).toHaveBeenCalledWith('variant-1');
      expect(variantRepository.softDelete).not.toHaveBeenCalled();
    });
  });
});
