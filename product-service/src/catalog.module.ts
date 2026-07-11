import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './db/entities/brand.entity';
import { Category } from './db/entities/category.entity';
import { Product } from './db/entities/product.entity';
import { ProductVariant } from './db/entities/product-variant.entity';
import { ProductImage } from './db/entities/product-image.entity';
import { ProductFaceShape } from './db/entities/product-face-shape.entity';
import { ProductsController } from './routes/products.controller';
import { CategoriesController } from './routes/categories.controller';
import { BrandsController } from './routes/brands.controller';
import { ProductsService } from './services/products.service';
import { CategoriesService } from './services/categories.service';
import { BrandsService } from './services/brands.service';
import { ProductImagesService } from './services/product-images.service';
import { SeedService } from './services/seed.service';
import { TypeOrmBrandRepository } from './repositories/brand.repository';
import { TypeOrmCategoryRepository } from './repositories/category.repository';
import { TypeOrmProductRepository } from './repositories/product.repository';
import { TypeOrmProductVariantRepository } from './repositories/product-variant.repository';
import { TypeOrmProductImageRepository } from './repositories/product-image.repository';
import { TypeOrmProductFaceShapeRepository } from './repositories/product-face-shape.repository';
import { S3ImageStorageRepository } from './repositories/image-storage.repository';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  PRODUCT_VARIANT_REPOSITORY,
  PRODUCT_IMAGE_REPOSITORY,
  PRODUCT_FACE_SHAPE_REPOSITORY,
  IMAGE_STORAGE_REPOSITORY,
} from './repositories/tokens';

/**
 * Catalog feature module: brands/categories/products/variants/images only (Q10) —
 * inventory/tags/product_tags/ratings/face_shape_styles have entities/migrations but no
 * repository/service/controller wiring this sprint.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Brand,
      Category,
      Product,
      ProductVariant,
      ProductImage,
      ProductFaceShape,
    ]),
  ],
  controllers: [ProductsController, CategoriesController, BrandsController],
  providers: [
    ProductsService,
    CategoriesService,
    BrandsService,
    ProductImagesService,
    SeedService,
    { provide: BRAND_REPOSITORY, useClass: TypeOrmBrandRepository },
    { provide: CATEGORY_REPOSITORY, useClass: TypeOrmCategoryRepository },
    { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository },
    {
      provide: PRODUCT_VARIANT_REPOSITORY,
      useClass: TypeOrmProductVariantRepository,
    },
    {
      provide: PRODUCT_IMAGE_REPOSITORY,
      useClass: TypeOrmProductImageRepository,
    },
    {
      provide: PRODUCT_FACE_SHAPE_REPOSITORY,
      useClass: TypeOrmProductFaceShapeRepository,
    },
    {
      provide: IMAGE_STORAGE_REPOSITORY,
      useClass: S3ImageStorageRepository,
    },
  ],
  exports: [SeedService],
})
export class CatalogModule {}
