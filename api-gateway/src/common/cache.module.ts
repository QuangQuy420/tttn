import { Global, Module } from '@nestjs/common';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { RedisService } from '../services/redis.service';
import { UsersProxyService } from '../services/users-proxy.service';

/**
 * Global so `PermissionsGuard` (used by the users, roles, products, orders
 * and engagement modules) and the role-mutation controllers can inject
 * `PermissionsCacheService` without each module re-providing it.
 * `UsersProxyService` is provided here only as the cache's upstream.
 */
@Global()
@Module({
  providers: [RedisService, UsersProxyService, PermissionsCacheService],
  exports: [RedisService, PermissionsCacheService],
})
export class CacheModule {}
