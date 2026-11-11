import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RedisService } from './redis.service';
import { UsersProxyService } from './users-proxy.service';

const KEY_PREFIX = 'perm:';

/**
 * Cache-aside in front of `UsersProxyService.getPermissions`: `perm:{userId}`
 * lives in Redis for `PERMISSIONS_CACHE_TTL_SECONDS` (60 s) and is deleted
 * right after a successful role change made through the gateway
 * (`UsersController` / `RolesController`). A miss or a Redis failure falls
 * back to user-service, so Redis being down only costs latency.
 */
@Injectable()
export class PermissionsCacheService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly usersProxyService: UsersProxyService,
    configService: ConfigService,
  ) {
    this.ttlSeconds =
      configService.get<AppConfig>('app')!.permissionsCacheTtlSeconds;
  }

  async getPermissions(userId: string): Promise<string[]> {
    const key = this.keyFor(userId);
    const cached = this.parse(await this.redisService.get(key));
    if (cached) {
      return cached;
    }

    const permissions = await this.usersProxyService.getPermissions(userId);
    await this.redisService.setEx(
      key,
      this.ttlSeconds,
      JSON.stringify(permissions),
    );
    return permissions;
  }

  /** After a role is assigned to / removed from one user. */
  invalidateUser(userId: string): Promise<void> {
    return this.redisService.del(this.keyFor(userId));
  }

  /** After a role itself is updated or deleted — any user may hold it. */
  invalidateAll(): Promise<void> {
    return this.redisService.delByPattern(`${KEY_PREFIX}*`);
  }

  /**
   * JWT `userId`s are lower-case UUIDs while a path `:id` may be upper-case:
   * both sides normalise here so a read and its invalidation hit the same key.
   */
  private keyFor(userId: string): string {
    return `${KEY_PREFIX}${userId.toLowerCase()}`;
  }

  private parse(value: string | null): string[] | null {
    if (value === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : null;
    } catch {
      return null;
    }
  }
}
