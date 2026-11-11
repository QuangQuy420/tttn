import { Module } from '@nestjs/common';
import { ProductsProxyService } from '../services/products-proxy.service';
import {
  BrandsController,
  CategoriesController,
  ProductsController,
} from './products.controller';

/**
 * Wires the `/api/products/*`, `/api/categories/*`, and `/api/brands/*`
 * proxy routes to `product-service`, per the route table in README.md.
 * `ProductsController`'s write routes use `PermissionsGuard`, whose
 * `PermissionsCacheService` comes from the global `CacheModule`.
 */
@Module({
  controllers: [ProductsController, CategoriesController, BrandsController],
  providers: [ProductsProxyService],
})
export class ProductsModule {}
