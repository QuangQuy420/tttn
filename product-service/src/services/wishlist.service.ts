import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IWishlistRepository } from '../repositories/wishlist.repository';
import { IProductRepository } from '../repositories/product.repository';
import {
  PRODUCT_REPOSITORY,
  WISHLIST_REPOSITORY,
} from '../repositories/tokens';
import { ProductsService } from './products.service';
import { ProductResponseDto } from '../routes/dto/product-response.dto';
import { PaginationQueryDto } from '../routes/dto/pagination-query.dto';
import { ProductStatus } from '../db/enums/product-status.enum';
import { Paginated, paginated } from '../common/api-response';

/** The user's liked products ("Yêu thích") — a behaviour signal for recommendations. */
@Injectable()
export class WishlistService {
  constructor(
    @Inject(WISHLIST_REPOSITORY)
    private readonly wishlistRepository: IWishlistRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    private readonly productsService: ProductsService,
  ) {}

  /** Idempotent like (AC1): liking twice leaves one row and returns `created: false`. */
  async add(userId: string, productId: string): Promise<{ created: boolean }> {
    const product =
      await this.productRepository.findByIdWithBrandAndCategory(productId);
    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new NotFoundException(`Không tìm thấy sản phẩm ${productId}`);
    }

    const created = await this.wishlistRepository.add(userId, productId);
    // plan 05: publish behavior.like / behavior.unlike when created/removed === true
    return { created };
  }

  async remove(
    userId: string,
    productId: string,
  ): Promise<{ removed: boolean }> {
    const removed = await this.wishlistRepository.remove(userId, productId);
    // plan 05: publish behavior.like / behavior.unlike when created/removed === true
    return { removed };
  }

  /** Liked PUBLISHED products, newest like first (AC2). */
  async list(
    userId: string,
    { page, limit }: PaginationQueryDto,
  ): Promise<Paginated<ProductResponseDto>> {
    const { productIds, total } =
      await this.wishlistRepository.findPublishedProductIdsPage(
        userId,
        page,
        limit,
      );
    const products = await this.productsService.findPublishedByIds(productIds);
    return paginated(products, total, page, limit);
  }

  productIds(userId: string): Promise<string[]> {
    return this.wishlistRepository.findProductIds(userId);
  }
}
