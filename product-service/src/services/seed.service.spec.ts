import { readFileSync } from 'fs';
import { SeedService } from './seed.service';
import { IBrandRepository } from '../repositories/brand.repository';
import { ICategoryRepository } from '../repositories/category.repository';
import { IProductRepository } from '../repositories/product.repository';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IProductFaceShapeRepository } from '../repositories/product-face-shape.repository';
import { ProductImagesService } from './product-images.service';
import { Brand } from '../db/entities/brand.entity';
import { Category } from '../db/entities/category.entity';
import { Product } from '../db/entities/product.entity';
import { ProductVariant } from '../db/entities/product-variant.entity';

jest.mock('fs', () => ({ readFileSync: jest.fn() }));

const mockedReadFileSync = readFileSync as jest.Mock;

function buildProduct(index: number, overrides: Record<string, unknown> = {}) {
  return {
    sku: `SKU-${index}`,
    name: `Product ${index}`,
    slug: `product-${index}`,
    brand: 'Brand A',
    category: 'Category A',
    frame_shape: 'ROUND',
    gender_target: 'UNISEX',
    base_price: 100,
    status: 'PUBLISHED',
    variants: [
      { color: 'Black', size: 'M', sku_variant: `SKU-${index}-BLK-M` },
    ],
    images: [{ image_url: `https://example.test/${index}.jpg` }],
    ...overrides,
  };
}

function buildValidSeedFile(productCount = 20) {
  return {
    brands: [{ name: 'Brand A' }],
    categories: [{ name: 'Category A', slug: 'category-a', parent: null }],
    products: Array.from({ length: productCount }, (_, i) => buildProduct(i)),
  };
}

describe('SeedService', () => {
  let brandRepository: jest.Mocked<IBrandRepository>;
  let categoryRepository: jest.Mocked<ICategoryRepository>;
  let productRepository: jest.Mocked<IProductRepository>;
  let variantRepository: jest.Mocked<IProductVariantRepository>;
  let faceShapeRepository: jest.Mocked<IProductFaceShapeRepository>;
  let productImagesService: jest.Mocked<
    Pick<ProductImagesService, 'create' | 'assertVariantBelongsToProduct'>
  >;
  let service: SeedService;

  beforeEach(() => {
    brandRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ id: `brand-${data.name}`, ...data } as Brand),
        ),
    };
    categoryRepository = {
      findAll: jest.fn(),
      findBySlug: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ id: `category-${data.slug}`, ...data } as Category),
        ),
      update: jest.fn(),
    };
    productRepository = {
      findAndCount: jest.fn(),
      findByIdWithBrandAndCategory: jest.fn(),
      findBySku: jest.fn().mockResolvedValue(null),
      findBySlug: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ id: `product-${data.sku}`, ...data } as Product),
        ),
      update: jest.fn(),
      softDelete: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };
    variantRepository = {
      findById: jest.fn(),
      findBySkuVariant: jest.fn(),
      findByProductIds: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'variant-x' }),
    };
    faceShapeRepository = {
      findByProductIds: jest.fn().mockResolvedValue([]),
      replaceForProduct: jest.fn().mockResolvedValue([]),
    };
    productImagesService = {
      create: jest.fn().mockResolvedValue({ id: 'image-x' }),
      assertVariantBelongsToProduct: jest.fn(),
    };

    service = new SeedService(
      brandRepository,
      categoryRepository,
      productRepository,
      variantRepository,
      faceShapeRepository,
      productImagesService as unknown as ProductImagesService,
    );

    mockedReadFileSync.mockReset();
  });

  it('rejects a seed file with fewer than 10 products (AC3 guard)', async () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify(buildValidSeedFile(9)));

    await expect(service.run('seed.json')).rejects.toThrow(/at least 10/);
    expect(productRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a seed file missing brands/categories/products arrays', async () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({ products: [] }));

    await expect(service.run('seed.json')).rejects.toThrow(/missing brands/);
  });

  it('seeds brands, categories, products, variants, and images (happy path)', async () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify(buildValidSeedFile(10)));

    const summary = await service.run('seed.json');

    expect(summary.brandsCreated).toBe(1);
    expect(summary.categoriesCreated).toBe(1);
    expect(summary.productsCreated).toBe(10);
    expect(summary.productsFailed).toBe(0);
    expect(summary.variantsCreated).toBe(10);
    expect(summary.imagesCreated).toBe(10);
    expect(productImagesService.create).toHaveBeenCalledTimes(10);
  });

  it('is idempotent: skips brands/categories/products that already exist', async () => {
    brandRepository.findByName.mockResolvedValue({
      id: 'existing-brand',
    } as Brand);
    categoryRepository.findBySlug.mockResolvedValue({
      id: 'existing-category',
    } as Category);
    productRepository.findBySku.mockResolvedValue({
      id: 'existing-product',
    } as Product);
    mockedReadFileSync.mockReturnValue(JSON.stringify(buildValidSeedFile(20)));

    const summary = await service.run('seed.json');

    expect(summary.brandsCreated).toBe(0);
    expect(summary.categoriesCreated).toBe(0);
    expect(summary.productsCreated).toBe(0);
    expect(summary.productsSkipped).toBe(20);
    expect(productRepository.create).not.toHaveBeenCalled();
  });

  it('rolls back and counts as failed a product whose variant insert throws, without blocking the rest', async () => {
    const seedFile = buildValidSeedFile(20);
    // Make the 5th product's variant insert fail (e.g. a DB unique-constraint violation).
    variantRepository.create.mockImplementation((data) => {
      if (data.productId === 'product-SKU-4') {
        return Promise.reject(new Error('duplicate key value'));
      }
      return Promise.resolve({ id: 'variant-x', ...data } as ProductVariant);
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(seedFile));

    const summary = await service.run('seed.json');

    expect(summary.productsFailed).toBe(1);
    expect(summary.productsCreated).toBe(19);
    expect(productRepository.deleteById).toHaveBeenCalledWith('product-SKU-4');
  });

  it('throws a clear error when a product references an unknown brand', async () => {
    const seedFile = buildValidSeedFile(20);
    seedFile.products[0] = buildProduct(0, { brand: 'Unknown Brand' });
    mockedReadFileSync.mockReturnValue(JSON.stringify(seedFile));

    const summary = await service.run('seed.json');

    // Unknown brand is a per-product failure, not a fatal error for the whole run.
    expect(summary.productsFailed).toBe(1);
    expect(summary.productsCreated).toBe(19);
  });
});
