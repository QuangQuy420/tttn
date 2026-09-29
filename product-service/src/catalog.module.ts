import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './db/entities/brand.entity';
import { Category } from './db/entities/category.entity';
import { Product } from './db/entities/product.entity';
import { ProductVariant } from './db/entities/product-variant.entity';
import { ProductImage } from './db/entities/product-image.entity';
import { StockReservation } from './db/entities/stock-reservation.entity';
import { WishlistItem } from './db/entities/wishlist-item.entity';
import { Review } from './db/entities/review.entity';
import { ProductsController } from './routes/products.controller';
import { ProductVariantsController } from './routes/product-variants.controller';
import { CategoriesController } from './routes/categories.controller';
import { BrandsController } from './routes/brands.controller';
import { WishlistController } from './routes/wishlist.controller';
import { ReviewsController } from './routes/reviews.controller';
import { ProductsService } from './services/products.service';
import { ProductVariantsService } from './services/product-variants.service';
import { CategoriesService } from './services/categories.service';
import { BrandsService } from './services/brands.service';
import { ProductImagesService } from './services/product-images.service';
import { SeedService } from './services/seed.service';
import { InventoryService } from './services/inventory.service';
import { WishlistService } from './services/wishlist.service';
import { ReviewsService } from './services/reviews.service';
import { TypeOrmBrandRepository } from './repositories/brand.repository';
import { TypeOrmCategoryRepository } from './repositories/category.repository';
import { TypeOrmProductRepository } from './repositories/product.repository';
import { TypeOrmProductVariantRepository } from './repositories/product-variant.repository';
import { TypeOrmProductImageRepository } from './repositories/product-image.repository';
import { S3ImageStorageRepository } from './repositories/image-storage.repository';
import { RabbitMqProductEventPublisher } from './repositories/product-event-publisher.repository';
import { TypeOrmInventoryRepository } from './repositories/inventory.repository';
import { TypeOrmStockReservationRepository } from './repositories/stock-reservation.repository';
import { RabbitMqOrderSagaEventPublisher } from './repositories/order-saga-event-publisher.repository';
import { OrderSagaEventConsumer } from './repositories/order-saga-event-consumer.repository';
import { TypeOrmWishlistRepository } from './repositories/wishlist.repository';
import { TypeOrmReviewRepository } from './repositories/review.repository';
import { HttpOrderPurchaseClient } from './repositories/order-purchase-client.repository';
import {
  BRAND_REPOSITORY,
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
  PRODUCT_VARIANT_REPOSITORY,
  PRODUCT_IMAGE_REPOSITORY,
  IMAGE_STORAGE_REPOSITORY,
  PRODUCT_EVENT_PUBLISHER,
  INVENTORY_REPOSITORY,
  STOCK_RESERVATION_REPOSITORY,
  ORDER_SAGA_EVENT_PUBLISHER,
  WISHLIST_REPOSITORY,
  REVIEW_REPOSITORY,
  ORDER_PURCHASE_CLIENT,
} from './repositories/tokens';

/**
 * Catalog feature module: brands/categories/products/variants/images (Q10), plus
 * inventory/stock-reservation wiring for the checkout saga (2026-07-28 saga plan) —
 * stock-reservation wiring for the checkout saga (2026-07-28 saga plan).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Brand,
      Category,
      Product,
      ProductVariant,
      ProductImage,
      StockReservation,
      WishlistItem,
      Review,
    ]),
  ],
  controllers: [
    ProductsController,
    ProductVariantsController,
    CategoriesController,
    BrandsController,
    WishlistController,
    ReviewsController,
  ],
  providers: [
    ProductsService,
    ProductVariantsService,
    CategoriesService,
    BrandsService,
    ProductImagesService,
    SeedService,
    InventoryService,
    OrderSagaEventConsumer,
    WishlistService,
    ReviewsService,
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
      provide: IMAGE_STORAGE_REPOSITORY,
      useClass: S3ImageStorageRepository,
    },
    {
      provide: PRODUCT_EVENT_PUBLISHER,
      useClass: RabbitMqProductEventPublisher,
    },
    {
      provide: INVENTORY_REPOSITORY,
      useClass: TypeOrmInventoryRepository,
    },
    {
      provide: STOCK_RESERVATION_REPOSITORY,
      useClass: TypeOrmStockReservationRepository,
    },
    {
      provide: ORDER_SAGA_EVENT_PUBLISHER,
      useClass: RabbitMqOrderSagaEventPublisher,
    },
    { provide: WISHLIST_REPOSITORY, useClass: TypeOrmWishlistRepository },
    { provide: REVIEW_REPOSITORY, useClass: TypeOrmReviewRepository },
    { provide: ORDER_PURCHASE_CLIENT, useClass: HttpOrderPurchaseClient },
  ],
  exports: [SeedService],
})
export class CatalogModule {}
