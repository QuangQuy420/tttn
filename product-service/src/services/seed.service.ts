import { Inject, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { IBrandRepository } from '../repositories/brand.repository';
import { ICategoryRepository } from '../repositories/category.repository';
import { IProductRepository } from '../repositories/product.repository';
import { IProductVariantRepository } from '../repositories/product-variant.repository';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  PRODUCT_VARIANT_REPOSITORY,
} from '../repositories/tokens';
import { ProductImagesService } from './product-images.service';
import { FrameShape } from '../db/enums/frame-shape.enum';
import { GenderTarget } from '../db/enums/gender-target.enum';
import { ProductStatus } from '../db/enums/product-status.enum';

interface SeedBrandInput {
  name: string;
  logo_url?: string | null;
  description?: string | null;
}

interface SeedCategoryInput {
  name: string;
  slug: string;
  parent?: string | null;
}

interface SeedVariantInput {
  color: string;
  size: string;
  extra_price?: number;
  sku_variant: string;
}

interface SeedImageInput {
  image_url: string;
  is_thumbnail?: boolean;
  sort_order?: number;
}

interface SeedProductInput {
  sku: string;
  name: string;
  slug: string;
  description?: string | null;
  brand: string;
  category: string;
  frame_shape: string;
  gender_target: string;
  material?: string | null;
  base_price: number;
  status?: string;
  variants: SeedVariantInput[];
  images: SeedImageInput[];
}

interface SeedFile {
  brands: SeedBrandInput[];
  categories: SeedCategoryInput[];
  products: SeedProductInput[];
}

export interface SeedSummary {
  brandsCreated: number;
  categoriesCreated: number;
  productsCreated: number;
  productsSkipped: number;
  productsFailed: number;
  variantsCreated: number;
  imagesCreated: number;
}

/** AC3 needs at least 20 seeded products — fail loudly rather than silently seeding fewer. */
const MIN_PRODUCTS = 20;

/**
 * Loads `infra/seed/products.json` (brands/categories/products, each product nesting
 * its own variants[]/images[]) into `product_db`. Only brands/categories/products/
 * variants/images are seeded (Q10) — inventory/tags/product_tags/ratings/
 * face_shape_styles stay empty this sprint.
 *
 * Idempotent by natural key so re-running (e.g. on every `docker compose up`) doesn't
 * duplicate rows: brand by `name`, category by `slug`, product by `sku`, variant by
 * `sku_variant`. Products are skipped entirely (including their variants/images) if a
 * product with the same `sku` already exists.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: IBrandRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepository: ICategoryRepository,
    @Inject(PRODUCT_REPOSITORY)
    private readonly productRepository: IProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY)
    private readonly variantRepository: IProductVariantRepository,
    private readonly productImagesService: ProductImagesService,
  ) {}

  async run(filePath: string): Promise<SeedSummary> {
    const seed = this.loadSeedFile(filePath);

    const summary: SeedSummary = {
      brandsCreated: 0,
      categoriesCreated: 0,
      productsCreated: 0,
      productsSkipped: 0,
      productsFailed: 0,
      variantsCreated: 0,
      imagesCreated: 0,
    };

    const brandIdByName = await this.seedBrands(seed.brands, summary);
    const categoryIdByName = await this.seedCategories(
      seed.categories,
      summary,
    );
    await this.seedProducts(
      seed.products,
      brandIdByName,
      categoryIdByName,
      summary,
    );

    this.logger.log(`Seed complete: ${JSON.stringify(summary)}`);
    return summary;
  }

  private async seedBrands(
    brands: SeedBrandInput[],
    summary: SeedSummary,
  ): Promise<Map<string, string>> {
    const brandIdByName = new Map<string, string>();
    for (const brandInput of brands) {
      let brand = await this.brandRepository.findByName(brandInput.name);
      if (!brand) {
        brand = await this.brandRepository.create({
          name: brandInput.name,
          logoUrl: brandInput.logo_url ?? null,
          description: brandInput.description ?? null,
        });
        summary.brandsCreated += 1;
      }
      brandIdByName.set(brandInput.name, brand.id);
    }
    return brandIdByName;
  }

  private async seedCategories(
    categories: SeedCategoryInput[],
    summary: SeedSummary,
  ): Promise<Map<string, string>> {
    const categoryIdByName = new Map<string, string>();

    // Pass 1: create/find every category without wiring parents yet, so a parent
    // referenced later in the array can still be resolved regardless of order.
    for (const categoryInput of categories) {
      let category = await this.categoryRepository.findBySlug(
        categoryInput.slug,
      );
      if (!category) {
        category = await this.categoryRepository.create({
          name: categoryInput.name,
          slug: categoryInput.slug,
          parentId: null,
        });
        summary.categoriesCreated += 1;
      }
      categoryIdByName.set(categoryInput.name, category.id);
    }

    // Pass 2: wire up `parent_id` for categories that declare a `parent` (matched by
    // parent category name, same reference style products use for brand/category).
    for (const categoryInput of categories) {
      if (!categoryInput.parent) continue;
      const categoryId = categoryIdByName.get(categoryInput.name);
      const parentId = categoryIdByName.get(categoryInput.parent);
      if (!categoryId || !parentId) {
        throw new Error(
          `Seed category "${categoryInput.name}" references unknown parent "${categoryInput.parent}"`,
        );
      }
      await this.categoryRepository.update(categoryId, { parentId });
    }

    return categoryIdByName;
  }

  private async seedProducts(
    products: SeedProductInput[],
    brandIdByName: Map<string, string>,
    categoryIdByName: Map<string, string>,
    summary: SeedSummary,
  ): Promise<void> {
    for (const productInput of products) {
      const existing = await this.productRepository.findBySku(productInput.sku);
      if (existing) {
        summary.productsSkipped += 1;
        continue;
      }

      // One bad product (e.g. a data-modeling gap upstream in infra/seed/products.json —
      // see report) must not block seeding the rest of the catalog; log and keep going
      // rather than aborting the whole run. A product that fails partway through (e.g.
      // its Product row was created but a variant insert then failed) counts as
      // "failed", not "created" — its row is left in place for a human to inspect.
      try {
        await this.seedOneProduct(
          productInput,
          brandIdByName,
          categoryIdByName,
          summary,
        );
        summary.productsCreated += 1;
      } catch (error) {
        summary.productsFailed += 1;
        this.logger.error(
          `Failed to seed product "${productInput.sku}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async seedOneProduct(
    productInput: SeedProductInput,
    brandIdByName: Map<string, string>,
    categoryIdByName: Map<string, string>,
    summary: SeedSummary,
  ): Promise<void> {
    const brandId = brandIdByName.get(productInput.brand);
    if (!brandId) {
      throw new Error(
        `Seed product "${productInput.sku}" references unknown brand "${productInput.brand}"`,
      );
    }
    const categoryId = categoryIdByName.get(productInput.category);
    if (!categoryId) {
      throw new Error(
        `Seed product "${productInput.sku}" references unknown category "${productInput.category}"`,
      );
    }

    const frameShape = this.parseEnum(
      FrameShape,
      productInput.frame_shape,
      `product ${productInput.sku} frame_shape`,
    );
    const genderTarget = this.parseEnum(
      GenderTarget,
      productInput.gender_target,
      `product ${productInput.sku} gender_target`,
    );
    const status = productInput.status
      ? this.parseEnum(
          ProductStatus,
          productInput.status,
          `product ${productInput.sku} status`,
        )
      : ProductStatus.DRAFT;

    const product = await this.productRepository.create({
      brandId,
      categoryId,
      sku: productInput.sku,
      name: productInput.name,
      slug: productInput.slug,
      description: productInput.description ?? null,
      frameShape,
      genderTarget,
      material: productInput.material ?? null,
      basePrice: productInput.base_price,
      status,
    });

    // Not a DB transaction (repositories don't expose one — see report on this
    // tradeoff), but a manual rollback: if any variant/image fails, delete the
    // just-created product rather than leaving a dangling row with partial/no
    // variants or images (AC3 requires every seeded product to have both). Local
    // counters only get merged into `summary` once the whole product succeeds, so a
    // rolled-back product's rows aren't double-counted as "created".
    let variantsCreated = 0;
    let imagesCreated = 0;
    try {
      for (const variantInput of productInput.variants ?? []) {
        await this.variantRepository.create({
          productId: product.id,
          color: variantInput.color,
          size: variantInput.size,
          extraPrice: variantInput.extra_price ?? 0,
          skuVariant: variantInput.sku_variant,
        });
        variantsCreated += 1;
      }

      for (const imageInput of productInput.images ?? []) {
        await this.productImagesService.create({
          productId: product.id,
          imageUrl: imageInput.image_url,
          isThumbnail: imageInput.is_thumbnail ?? false,
          sortOrder: imageInput.sort_order ?? 0,
        });
        imagesCreated += 1;
      }
    } catch (error) {
      await this.productRepository.deleteById(product.id);
      throw error;
    }

    summary.variantsCreated += variantsCreated;
    summary.imagesCreated += imagesCreated;
  }

  private loadSeedFile(filePath: string): SeedFile {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SeedFile>;

    if (
      !Array.isArray(parsed.brands) ||
      !Array.isArray(parsed.categories) ||
      !Array.isArray(parsed.products)
    ) {
      throw new Error(
        `Seed file ${filePath} is missing brands[]/categories[]/products[] arrays`,
      );
    }
    if (parsed.products.length < MIN_PRODUCTS) {
      throw new Error(
        `Seed file ${filePath} has only ${parsed.products.length} products — need at least ${MIN_PRODUCTS}`,
      );
    }

    return parsed as SeedFile;
  }

  private parseEnum<T extends Record<string, string>>(
    enumObj: T,
    value: string,
    context: string,
  ): T[keyof T] {
    if (!Object.values(enumObj).includes(value)) {
      throw new Error(`Invalid enum value "${value}" for ${context}`);
    }
    return value as T[keyof T];
  }
}
