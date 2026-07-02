import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IProductRepository,
  ProductListFilter,
} from '../repositories/product.repository';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IProductImageRepository } from '../repositories/product-image.repository';
import {
  PRODUCT_REPOSITORY,
  PRODUCT_VARIANT_REPOSITORY,
  PRODUCT_IMAGE_REPOSITORY,
} from '../repositories/tokens';
import { ListProductsQueryDto } from '../routes/dto/list-products-query.dto';
import { PaginatedResponseDto } from '../routes/dto/paginated-response.dto';
import { ProductResponseDto } from '../routes/dto/product-response.dto';
import { Product } from '../db/entities/product.entity';
import { ProductVariant } from '../db/entities/product-variant.entity';
import { ProductImage } from '../db/entities/product-image.entity';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY)
    private readonly variantRepository: IProductVariantRepository,
    @Inject(PRODUCT_IMAGE_REPOSITORY)
    private readonly imageRepository: IProductImageRepository,
  ) {}

  async findAll(
    query: ListProductsQueryDto,
  ): Promise<PaginatedResponseDto<ProductResponseDto>> {
    const filter: ProductListFilter = {
      categoryId: query.categoryId,
      brandId: query.brandId,
      frameShape: query.frameShape,
      genderTarget: query.genderTarget,
      status: query.status,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      search: query.search,
      page: query.page,
      limit: query.limit,
    };

    const { items, total } = await this.productRepository.findAndCount(filter);

    if (items.length === 0) {
      return new PaginatedResponseDto<ProductResponseDto>(
        [],
        total,
        query.page,
        query.limit,
      );
    }

    const productIds = items.map((product) => product.id);
    const [variants, images] = await Promise.all([
      this.variantRepository.findByProductIds(productIds),
      this.imageRepository.findByProductIds(productIds),
    ]);

    const dtos = items.map((product) =>
      this.toResponseDto(product, variants, images),
    );

    return new PaginatedResponseDto<ProductResponseDto>(
      dtos,
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    const product =
      await this.productRepository.findByIdWithBrandAndCategory(id);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    const [variants, images] = await Promise.all([
      this.variantRepository.findByProductIds([id]),
      this.imageRepository.findByProductIds([id]),
    ]);

    return this.toResponseDto(product, variants, images);
  }

  private toResponseDto(
    product: Product,
    allVariants: ProductVariant[],
    allImages: ProductImage[],
  ): ProductResponseDto {
    if (!product.brand || !product.category) {
      throw new Error(
        `Product ${product.id} is missing brand/category relations — repository must load them`,
      );
    }

    const dto = new ProductResponseDto();
    dto.id = product.id;
    dto.sku = product.sku;
    dto.name = product.name;
    dto.slug = product.slug;
    dto.description = product.description;
    dto.frameShape = product.frameShape;
    dto.genderTarget = product.genderTarget;
    dto.material = product.material;
    dto.basePrice = product.basePrice;
    dto.status = product.status;
    dto.brand = {
      id: product.brand.id,
      name: product.brand.name,
      logoUrl: product.brand.logoUrl,
    };
    dto.category = {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
    };
    dto.variants = allVariants
      .filter((variant) => variant.productId === product.id)
      .map((variant) => ({
        id: variant.id,
        color: variant.color,
        size: variant.size,
        extraPrice: variant.extraPrice,
        skuVariant: variant.skuVariant,
      }));
    dto.images = allImages
      .filter((image) => image.productId === product.id)
      .map((image) => ({
        id: image.id,
        variantId: image.variantId,
        imageUrl: image.imageUrl,
        isThumbnail: image.isThumbnail,
        sortOrder: image.sortOrder,
      }));
    dto.createdAt = product.createdAt;
    dto.updatedAt = product.updatedAt;

    return dto;
  }
}
