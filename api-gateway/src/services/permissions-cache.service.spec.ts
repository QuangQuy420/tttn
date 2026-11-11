import { ConfigService } from '@nestjs/config';
import { PermissionsCacheService } from './permissions-cache.service';
import { RedisService } from './redis.service';
import { UsersProxyService } from './users-proxy.service';

describe('PermissionsCacheService', () => {
  const USER_ID = 'user-1';
  const PERMISSIONS = ['product:manage', 'order:read'];
  let redis: {
    get: jest.Mock;
    setEx: jest.Mock;
    del: jest.Mock;
    delByPattern: jest.Mock;
  };
  let usersProxyService: { getPermissions: jest.Mock };
  let configService: ConfigService;
  let service: PermissionsCacheService;

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      setEx: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    };
    usersProxyService = { getPermissions: jest.fn().mockResolvedValue(PERMISSIONS) };
    configService = {
      get: jest.fn().mockReturnValue({ permissionsCacheTtlSeconds: 60 }),
    } as unknown as ConfigService;
    service = new PermissionsCacheService(
      redis as unknown as RedisService,
      usersProxyService as unknown as UsersProxyService,
      configService,
    );
  });

  it('returns cached permissions without calling user-service on a hit (AC4)', async () => {
    redis.get.mockResolvedValue(JSON.stringify(PERMISSIONS));

    await expect(service.getPermissions(USER_ID)).resolves.toEqual(PERMISSIONS);

    expect(redis.get).toHaveBeenCalledWith('perm:user-1');
    expect(usersProxyService.getPermissions).not.toHaveBeenCalled();
    expect(redis.setEx).not.toHaveBeenCalled();
  });

  it('on a miss calls user-service once and caches the result with the TTL (AC4)', async () => {
    redis.get.mockResolvedValue(null);

    await expect(service.getPermissions(USER_ID)).resolves.toEqual(PERMISSIONS);

    expect(usersProxyService.getPermissions).toHaveBeenCalledTimes(1);
    expect(usersProxyService.getPermissions).toHaveBeenCalledWith(USER_ID);
    expect(redis.setEx).toHaveBeenCalledWith(
      'perm:user-1',
      60,
      JSON.stringify(PERMISSIONS),
    );
  });

  it('falls back to user-service when Redis is down — real RedisService, never connected (AC6)', async () => {
    // Real RedisService: lazyConnect + no offline queue, and onModuleInit is not
    // called, so every command fails at once without touching the network.
    const realRedis = new RedisService({
      get: jest.fn().mockReturnValue({ redisUrl: 'redis://127.0.0.1:1' }),
    } as unknown as ConfigService);
    service = new PermissionsCacheService(
      realRedis,
      usersProxyService as unknown as UsersProxyService,
      configService,
    );

    try {
      await expect(service.getPermissions(USER_ID)).resolves.toEqual(PERMISSIONS);
      await expect(service.invalidateAll()).resolves.toBeUndefined();
      expect(usersProxyService.getPermissions).toHaveBeenCalledWith(USER_ID);
    } finally {
      realRedis.onModuleDestroy();
    }
  });

  it('invalidateUser deletes only that user key; invalidateAll deletes perm:* (AC5)', async () => {
    await service.invalidateUser(USER_ID);
    await service.invalidateAll();

    expect(redis.del).toHaveBeenCalledWith('perm:user-1');
    expect(redis.delByPattern).toHaveBeenCalledWith('perm:*');
  });
});
