import { Module } from '@nestjs/common';
import { AdminAnalyticsProxyService } from '../services/admin-analytics-proxy.service';
import {
  AdminAiController,
  AdminAnalyticsController,
} from './admin-analytics.controller';

/**
 * Wires the `/api/admin/ai/*` and `/api/admin/analytics/*` proxy routes to
 * the `/admin/*` routes of `face-processing-service` and
 * `recommendation-service`. `PermissionsGuard`'s `PermissionsCacheService`
 * comes from the global `CacheModule`.
 */
@Module({
  controllers: [AdminAiController, AdminAnalyticsController],
  providers: [AdminAnalyticsProxyService],
})
export class AdminAnalyticsModule {}
