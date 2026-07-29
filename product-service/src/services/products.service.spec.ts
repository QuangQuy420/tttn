import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { IProductRepository } from '../repositories/product.repository';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IProductImageRepository } from '../repositories/product-image.repository';
import { IProductFaceShapeRepository } from '../repositories/product-face-shape.repository';
import { IBrandRepository } from '../repositories/brand.repository';
import { ICategoryRepository } from '../repositories/category.repository';
import { IProductEventPublisher } from '../repositories/product-event-publisher.repository';
import { IInventoryRepository } from '../repositories/inventory.repository';
import { Product } from '../db/entities/product.entity';
import { ProductVariant } from '../db/entities/product-variant.entity';
import { ProductImage } from '../db/entities/product-image.entity';
import { FrameShape } from '../db/enums/frame-shape.enum';
import { GenderTarget } from '../db/enums/gender-target.enum';
import { ProductStatus } from '../db/enums/product-status.enum';
import { ListProductsQueryDto } from '../routes/dto/list-products-query.dto';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    brandId: 'brand-1',
    categoryId: 'category-1',
    sku: 'SKU-1',
    name: 'Test Product',
    slug: 'test-product',
    description: null,
    faceFitNote: null,
    frameShape: FrameShape.ROUND,
    genderTarget: GenderTarget.UNISEX,
    material: 'Metal',
    basePrice: 100,
    status: ProductStatus.PUBLISHED,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    brand: {
      id: 'brand-1',
      name: 'Test Brand',
      logoUrl: null,
    } as Product['brand'],
    category: {
      id: 'category-1',
      name: 'Test Category',
      slug: 'test-category',
    } as Product['category'],
    ...overrides,
  };
}

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'variant-1',
    productId: 'product-1',
    color: 'Black',
    size: 'M',
    extraPrice: 0,
    skuVariant: 'SKU-1-BLK-M',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeImage(overrides: Partial<ProductImage> = {}): ProductImage {
  return {
    id: 'image-1',
    productId: 'product-1',
    variantId: null,
    imageUrl: 'https://example.test/image.jpg',
    isThumbnail: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ProductsService', () => {
  let productRepository: jest.Mocked<IProductRepository>;
  let variantRepository: jest.Mocked<IProductVariantRepository>;
  let imageRepository: jest.Mocked<IProductImageRepository>;
  let faceShapeRepository: jest.Mocked<IProductFaceShapeRepository>;
  let brandRepository: jest.Mocked<IBrandRepository>;
  let categoryRepository: jest.Mocked<ICategoryRepository>;
  let eventPublisher: jest.Mocked<IProductEventPublisher>;
  let inventoryRepository: jest.Mocked<IInventoryRepository>;
  let service: ProductsService;

  beforeEach(() => {
    productRepository = {
      findAndCount: jest.fn(),
      findByIdWithBrandAndCategory: jest.fn(),
      findBySku: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      deleteById: jest.fn(),
    };
    variantRepository = {
      findById: jest.fn(),
      findBySkuVariant: jest.fn(),
      findByProductIds: jest.fn(),
      create: jest.fn(),
    };
    imageRepository = {
      findByProductIds: jest.fn(),
      findByProductAndUrl: jest.fn(),
      findByProductAndSortOrder: jest.fn(),
      create: jest.fn(),
      deleteById: jest.fn(),
    };
    faceShapeRepository = {
      findByProductIds: jest.fn().mockResolvedValue([]),
      replaceForProduct: jest.fn(),
    };
    brandRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
    };
    categoryRepository = {
      findAll: jest.fn(),
      findBySlug: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    eventPublisher = {
      publish: jest.fn(),
    };
    inventoryRepository = {
      reserve: jest.fn(),
      release: jest.fn(),
      findAvailableByVariantIds: jest.fn().mockResolvedValue(new Map()),
      create: jest.fn(),
    };

    service = new ProductsService(
      productRepository,
      variantRepository,
      imageRepository,
      faceShapeRepository,
      brandRepository,
      categoryRepository,
      eventPublisher,
      inventoryRepository,
    );
  });

  function baseQuery(overrides: Partial<ListProductsQueryDto> = {}) {
    const dto = new ListProductsQueryDto();
    dto.page = 1;
    dto.limit = 20;
    return Object.assign(dto, overrides);
  }

  describe('findAll', () => {
    it('maps filtered/paginated products with their variants and images (happy path)', async () => {
      const product = makeProduct();
      productRepository.findAndCount.mockResolvedValue({
        items: [product],
        total: 1,
      });
      variantRepository.findByProductIds.mockResolvedValue([makeVariant()]);
      imageRepository.findByProductIds.mockResolvedValue([makeImage()]);

      const result = await service.findAll(baseQuery());

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].variants).toHaveLength(1);
      expect(result.items[0].images).toHaveLength(1);
      expect(result.items[0].brand.name).toBe('Test Brand');
      expect(result.totalPages).toBe(1);
    });

    it('passes filter fields straight through to the repository', async () => {
      productRepository.findAndCount.mockResolvedValue({ items: [], total: 0 });

      const query = baseQuery({
        categoryId: 'cat-x',
        brandId: 'brand-x',
        frameShape: FrameShape.CAT_EYE,
        genderTarget: GenderTarget.FEMALE,
        status: ProductStatus.DRAFT,
        minPrice: 10,
        maxPrice: 200,
        search: 'wayfarer',
        page: 2,
        limit: 5,
      });

      await service.findAll(query);

      const passedFilter = productRepository.findAndCount.mock.calls[0][0];
      expect(passedFilter).toMatchObject({
        categoryId: 'cat-x',
        brandId: 'brand-x',
        frameShape: FrameShape.CAT_EYE,
        genderTarget: GenderTarget.FEMALE,
        status: ProductStatus.DRAFT,
        minPrice: 10,
        maxPrice: 200,
        search: 'wayfarer',
        page: 2,
        limit: 5,
      });
    });

    it('returns an empty page without querying variants/images when nothing matches', async () => {
      productRepository.findAndCount.mockResolvedValue({ items: [], total: 0 });

      const result = await service.findAll(baseQuery());

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(variantRepository.findByProductIds).not.toHaveBeenCalled();
      expect(imageRepository.findByProductIds).not.toHaveBeenCalled();
    });

    it('computes totalPages at the pagination boundary (exact multiple)', async () => {
      productRepository.findAndCount.mockResolvedValue({
        items: [makeProduct()],
        total: 40,
      });
      variantRepository.findByProductIds.mockResolvedValue([]);
      imageRepository.findByProductIds.mockResolvedValue([]);

      const result = await service.findAll(baseQuery({ limit: 20 }));

      expect(result.totalPages).toBe(2);
    });

    it('only attaches variants/images belonging to each specific product', async () => {
      const productA = makeProduct({ id: 'product-A' });
      const productB = makeProduct({ id: 'product-B' });
      productRepository.findAndCount.mockResolvedValue({
        items: [productA, productB],
        total: 2,
      });
      variantRepository.findByProductIds.mockResolvedValue([
        makeVariant({ id: 'v-a', productId: 'product-A' }),
        makeVariant({ id: 'v-b', productId: 'product-B' }),
      ]);
      imageRepository.findByProductIds.mockResolvedValue([
        makeImage({ id: 'i-a', productId: 'product-A' }),
      ]);

      const result = await service.findAll(baseQuery());

      const a = result.items.find((p) => p.id === 'product-A')!;
      const b = result.items.find((p) => p.id === 'product-B')!;
      expect(a.variants.map((v) => v.id)).toEqual(['v-a']);
      expect(a.images.map((i) => i.id)).toEqual(['i-a']);
      expect(b.variants.map((v) => v.id)).toEqual(['v-b']);
      expect(b.images).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns the product detail with variants + images', async () => {
      productRepository.findByIdWithBrandAndCategory.mockResolvedValue(
        makeProduct(),
      );
      variantRepository.findByProductIds.mockResolvedValue([makeVariant()]);
      imageRepository.findByProductIds.mockResolvedValue([makeImage()]);

      const result = await service.findOne('product-1');

      expect(result.id).toBe('product-1');
      expect(result.variants).toHaveLength(1);
      expect(result.images).toHaveLength(1);
    });

    it('throws NotFoundException when the product does not exist', async () => {
      productRepository.findByIdWithBrandAndCategory.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(variantRepository.findByProductIds).not.toHaveBeenCalled();
    });
  });
});
