import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  IProductRepository,
  ProductListFilter,
} from '../repositories/product.repository';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import { IProductImageRepository } from '../repositories/product-image.repository';
import { IBrandRepository } from '../repositories/brand.repository';
import { ICategoryRepository } from '../repositories/category.repository';
import { IProductEventPublisher } from '../repositories/product-event-publisher.repository';
import { IInventoryRepository } from '../repositories/inventory.repository';
import {
  PRODUCT_REPOSITORY,
  PRODUCT_VARIANT_REPOSITORY,
  PRODUCT_IMAGE_REPOSITORY,
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  PRODUCT_EVENT_PUBLISHER,
  INVENTORY_REPOSITORY,
} from '../repositories/tokens';
import { ListProductsQueryDto } from '../routes/dto/list-products-query.dto';
import { PaginatedResponseDto } from '../routes/dto/paginated-response.dto';
import { ProductResponseDto } from '../routes/dto/product-response.dto';
import { CreateProductDto } from '../routes/dto/create-product.dto';
import { UpdateProductDto } from '../routes/dto/update-product.dto';
import { Product } from '../db/entities/product.entity';
import { ProductVariant } from '../db/entities/product-variant.entity';
import { ProductImage } from '../db/entities/product-image.entity';
import { ProductStatus } from '../db/enums/product-status.enum';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY)
    private readonly variantRepository: IProductVariantRepository,
    @Inject(PRODUCT_IMAGE_REPOSITORY)
    private readonly imageRepository: IProductImageRepository,
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: IBrandRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(PRODUCT_EVENT_PUBLISHER)
    private readonly eventPublisher: IProductEventPublisher,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepository: IInventoryRepository,
  ) {}

  async findAll(
    query: ListProductsQueryDto,
  ): Promise<PaginatedResponseDto<ProductResponseDto>> {
    const filter: ProductListFilter = {
      categoryId: query.categoryId,
      brandId: query.brandId,
      frameShape: query.frameShape,
      genderTarget: query.genderTarget,
      faceShape: query.faceShape,
      status: query.status,
      includeAllStatuses: query.includeAllStatuses,
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
      throw new NotFoundException(`Không tìm thấy sản phẩm ${id}`);
    }

    const [variants, images] = await Promise.all([
      this.variantRepository.findByProductIds([id]),
      this.imageRepository.findByProductIds([id]),
    ]);

    // stock (FR7) is only sourced here — order-service's single call point for pricing
    // (GET /products/:id) — not in findAll()/the catalog listing endpoint.
    const stockByVariantId =
      await this.inventoryRepository.findAvailableByVariantIds(
        variants.map((variant) => variant.id),
      );

    return this.toResponseDto(product, variants, images, stockByVariantId);
  }

  async create(dto: CreateProductDto): Promise<ProductResponseDto> {
    await this.assertCategoryAndBrandExist(dto.categoryId, dto.brandId);

    const slug = await this.generateUniqueSlug(dto.name);
    const sku = await this.generateUniqueSku();

    const product = await this.productRepository.create({
      brandId: dto.brandId,
      categoryId: dto.categoryId,
      sku,
      name: dto.name,
      slug,
      description: dto.description ?? null,
      faceFitNote: dto.faceFitNote ?? null,
      faceShapes: dto.faceShapes ?? [],
      frameShape: dto.frameShape,
      genderTarget: dto.genderTarget,
      material: dto.material ?? null,
      basePrice: dto.basePrice,
      status: dto.status ?? ProductStatus.PUBLISHED,
    });

    return this.findOne(product.id);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponseDto> {
    const existing =
      await this.productRepository.findByIdWithBrandAndCategory(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy sản phẩm ${id}`);
    }

    if (dto.categoryId || dto.brandId) {
      await this.assertCategoryAndBrandExist(
        dto.categoryId ?? existing.categoryId,
        dto.brandId ?? existing.brandId,
      );
    }

    const updateData: Partial<Product> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.categoryId !== undefined) updateData.categoryId = dto.categoryId;
    if (dto.brandId !== undefined) updateData.brandId = dto.brandId;
    if (dto.frameShape !== undefined) updateData.frameShape = dto.frameShape;
    if (dto.genderTarget !== undefined)
      updateData.genderTarget = dto.genderTarget;
    if (dto.material !== undefined) updateData.material = dto.material;
    if (dto.basePrice !== undefined) updateData.basePrice = dto.basePrice;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.faceFitNote !== undefined) updateData.faceFitNote = dto.faceFitNote;
    if (dto.faceShapes !== undefined) updateData.faceShapes = dto.faceShapes;
    if (dto.status !== undefined) updateData.status = dto.status;

    if (Object.keys(updateData).length > 0) {
      await this.productRepository.update(id, updateData);
    }

    await this.eventPublisher.publish({
      type: 'product.updated',
      productId: id,
    });

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const existing =
      await this.productRepository.findByIdWithBrandAndCategory(id);
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy sản phẩm ${id}`);
    }
    await this.productRepository.softDelete(id);

    await this.eventPublisher.publish({
      type: 'product.deleted',
      productId: id,
    });
  }

  /** Throws `BadRequestException` (400) on an invalid/missing FK — AC8. */
  private async assertCategoryAndBrandExist(
    categoryId: string,
    brandId: string,
  ): Promise<void> {
    const [category, brand] = await Promise.all([
      this.categoryRepository.findById(categoryId),
      this.brandRepository.findById(brandId),
    ]);
    if (!category) {
      throw new BadRequestException(`categoryId ${categoryId} không tồn tại`);
    }
    if (!brand) {
      throw new BadRequestException(`brandId ${brandId} không tồn tại`);
    }
  }

  /** Normalizes/strips diacritics/kebab-cases `name`; appends -2/-3 on collision. */
  private async generateUniqueSlug(name: string): Promise<string> {
    const base = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, (match) => (match === 'đ' ? 'd' : 'D'))
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = base;
    let suffix = 2;
    while (await this.productRepository.findBySlug(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }

  /** Short random unique code — SKU isn't exposed on the admin form (Q1). */
  private async generateUniqueSku(): Promise<string> {
    let sku: string;
    do {
      sku = randomBytes(4).toString('hex').toUpperCase();
    } while (await this.productRepository.findBySku(sku));
    return sku;
  }

  private toResponseDto(
    product: Product,
    allVariants: ProductVariant[],
    allImages: ProductImage[],
    stockByVariantId?: Map<string, number>,
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
    dto.faceFitNote = product.faceFitNote;
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
        colorHex: variant.colorHex,
        size: variant.size,
        extraPrice: variant.extraPrice,
        skuVariant: variant.skuVariant,
        // undefined (omitted from JSON) when the caller (findAll()) didn't pass a stock
        // map at all; defaults to 0 for a variant with no available stock when it did.
        stock: stockByVariantId
          ? (stockByVariantId.get(variant.id) ?? 0)
          : undefined,
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
    dto.faceShapes = product.faceShapes;
    dto.createdAt = product.createdAt;
    dto.updatedAt = product.updatedAt;

    return dto;
  }
}
