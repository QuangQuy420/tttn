import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { EngagementProxyService } from '../services/engagement-proxy.service';
import { UsersProxyService } from '../services/users-proxy.service';
import {
  AdminReviewsController,
  ProductReviewsController,
  WishlistController,
} from './engagement.controller';

/**
 * Wires the `/api/wishlist/*`, `/api/products/:id/reviews/*`, and
 * `/api/admin/reviews/*` proxy routes to `product-service`.
 * `UsersProxyService` is provided for `PermissionsGuard` on the admin routes
 * (same reason as `ProductsModule`).
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
  controllers: [
    WishlistController,
    ProductReviewsController,
    AdminReviewsController,
  ],
  providers: [EngagementProxyService, UsersProxyService],
})
export class EngagementModule {}
