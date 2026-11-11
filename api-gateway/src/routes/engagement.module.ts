import { Module } from '@nestjs/common';
import { EngagementProxyService } from '../services/engagement-proxy.service';
import {
  AdminReviewsController,
  ProductReviewsController,
  WishlistController,
} from './engagement.controller';

/**
 * Wires the `/api/wishlist/*`, `/api/products/:id/reviews/*`, and
 * `/api/admin/reviews/*` proxy routes to `product-service`.
 * The admin routes use `PermissionsGuard` (its `PermissionsCacheService` comes
 * from the global `CacheModule`).
 */
@Module({
  controllers: [
    WishlistController,
    ProductReviewsController,
    AdminReviewsController,
  ],
  providers: [EngagementProxyService],
})
export class EngagementModule {}
