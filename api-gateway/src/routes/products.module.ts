import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { ProductsProxyService } from '../services/products-proxy.service';
import { UsersProxyService } from '../services/users-proxy.service';
import {
  BrandsController,
  CategoriesController,
  ProductsController,
} from './products.controller';

/**
 * Wires the `/api/products/*`, `/api/categories/*`, and `/api/brands/*`
 * proxy routes to `product-service`, per the route table in README.md.
 * `UsersProxyService` is also provided here (alongside `ProductsProxyService`)
 * because `ProductsController`'s write routes use `PermissionsGuard`, which
 * calls `UsersProxyService.getPermissions` to check the caller's live
 * permissions against user-service.
 */
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<AppConfig>('app')!.downstreamTimeoutMs,
      }),
    }),
  ],
  controllers: [ProductsController, CategoriesController, BrandsController],
  providers: [ProductsProxyService, UsersProxyService],
})
export class ProductsModule {}
