import { NotFoundException } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { IWishlistRepository } from '../repositories/wishlist.repository';
import { IProductRepository } from '../repositories/product.repository';
import { ProductsService } from './products.service';
import { Product } from '../db/entities/product.entity';
import { ProductStatus } from '../db/enums/product-status.enum';
import { ProductResponseDto } from '../routes/dto/product-response.dto';

describe('WishlistService', () => {
  let wishlistRepository: jest.Mocked<IWishlistRepository>;
  let productRepository: jest.Mocked<
    Pick<IProductRepository, 'findByIdWithBrandAndCategory'>
  >;
  let productsService: jest.Mocked<Pick<ProductsService, 'findPublishedByIds'>>;
  let service: WishlistService;

  beforeEach(() => {
    wishlistRepository = {
      add: jest.fn(),
      remove: jest.fn(),
      findPublishedProductIdsPage: jest.fn(),
      findProductIds: jest.fn(),
    };
    productRepository = { findByIdWithBrandAndCategory: jest.fn() };
    productsService = { findPublishedByIds: jest.fn() };
    service = new WishlistService(
      wishlistRepository,
      productRepository as unknown as IProductRepository,
      productsService as unknown as ProductsService,
    );
  });

  it('likes a published product idempotently: first add created=true, second created=false (AC1)', async () => {
    productRepository.findByIdWithBrandAndCategory.mockResolvedValue({
      id: 'product-1',
      status: ProductStatus.PUBLISHED,
    } as Product);
    wishlistRepository.add
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(service.add('user-1', 'product-1')).resolves.toEqual({
      created: true,
    });
    await expect(service.add('user-1', 'product-1')).resolves.toEqual({
      created: false,
    });
    expect(wishlistRepository.add).toHaveBeenCalledWith('user-1', 'product-1');
  });

  it('throws 404 when liking an unknown product and writes nothing', async () => {
    productRepository.findByIdWithBrandAndCategory.mockResolvedValue(null);

    await expect(service.add('user-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(wishlistRepository.add).not.toHaveBeenCalled();
  });

  it('lists liked products as a page hydrated via ProductsService (AC2)', async () => {
    wishlistRepository.findPublishedProductIdsPage.mockResolvedValue({
      productIds: ['product-2', 'product-1'],
      total: 3,
    });
    const products = [
      { id: 'product-2' },
      { id: 'product-1' },
    ] as ProductResponseDto[];
    productsService.findPublishedByIds.mockResolvedValue(products);

    const result = await service.list('user-1', { page: 1, limit: 2 });

    expect(wishlistRepository.findPublishedProductIdsPage).toHaveBeenCalledWith(
      'user-1',
      1,
      2,
    );
    expect(productsService.findPublishedByIds).toHaveBeenCalledWith([
      'product-2',
      'product-1',
    ]);
    expect(result.items).toEqual(products);
    expect(result.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });
});
