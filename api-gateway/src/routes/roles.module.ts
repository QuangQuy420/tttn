import { Module } from '@nestjs/common';
import { UsersProxyService } from '../services/users-proxy.service';
import { PermissionsController, RolesController } from './roles.controller';

/**
 * Wires the `/api/roles/*` and `/api/permissions` proxy routes to
 * user-service. Provides its own `UsersProxyService` for the controllers
 * (as `UsersModule` does); `PermissionsGuard` and the permissions-cache
 * invalidation use `PermissionsCacheService` from the global `CacheModule`,
 * and `HttpService` comes from the global `SharedHttpModule`.
 */
@Module({
  controllers: [RolesController, PermissionsController],
  providers: [UsersProxyService],
})
export class RolesModule {}
