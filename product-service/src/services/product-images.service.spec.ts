import { BadRequestException } from '@nestjs/common';
import { ProductImagesService } from './product-images.service';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IProductImageRepository } from '../repositories/product-image.repository';
import { IImageStorageRepository } from '../repositories/image-storage.repository';
import { ProductVariant } from '../db/entities/product-variant.entity';

describe('ProductImagesService', () => {
  let variantRepository: jest.Mocked<IProductVariantRepository>;
  let imageRepository: jest.Mocked<IProductImageRepository>;
  let imageStorageRepository: jest.Mocked<IImageStorageRepository>;
  let service: ProductImagesService;

  beforeEach(() => {
    variantRepository = {
      findById: jest.fn(),
      findBySkuVariant: jest.fn(),
      findByProductIds: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    imageRepository = {
      findById: jest.fn(),
      findByProductIds: jest.fn(),
      findByProductAndUrl: jest.fn(),
      findByProductAndSortOrder: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteById: jest.fn(),
    };
    imageStorageRepository = {
      upload: jest.fn(),
      deleteByUrl: jest.fn(),
    };
    service = new ProductImagesService(
      variantRepository,
      imageRepository,
      imageStorageRepository,
    );
  });

  describe('create', () => {
    it('creates an image with no variantId without touching the variant repository', async () => {
      imageRepository.create.mockResolvedValue({ id: 'image-1' } as never);

      await service.create({
        productId: 'product-1',
        imageUrl: 'https://example.test/a.jpg',
      });

      expect(variantRepository.findById).not.toHaveBeenCalled();
      expect(imageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'product-1',
          variantId: null,
          imageUrl: 'https://example.test/a.jpg',
        }),
      );
    });

    it('creates an image whose variantId belongs to the same product', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'variant-1',
        productId: 'product-1',
      } as ProductVariant);
      imageRepository.create.mockResolvedValue({ id: 'image-1' } as never);

      await service.create({
        productId: 'product-1',
        variantId: 'variant-1',
        imageUrl: 'https://example.test/a.jpg',
      });

      expect(imageRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'product-1',
          variantId: 'variant-1',
        }),
      );
    });

    it('rejects when the variant does not exist', async () => {
      variantRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({
          productId: 'product-1',
          variantId: 'missing-variant',
          imageUrl: 'https://example.test/a.jpg',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(imageRepository.create).not.toHaveBeenCalled();
    });

    it('rejects when the variant belongs to a different product (Q11 cross-check)', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'variant-1',
        productId: 'some-other-product',
      } as ProductVariant);

      await expect(
        service.create({
          productId: 'product-1',
          variantId: 'variant-1',
          imageUrl: 'https://example.test/a.jpg',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(imageRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('assertVariantBelongsToProduct', () => {
    it('resolves without throwing for a matching product/variant pair', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'variant-1',
        productId: 'product-1',
      } as ProductVariant);

      await expect(
        service.assertVariantBelongsToProduct('product-1', 'variant-1'),
      ).resolves.toBeUndefined();
    });
  });
});
