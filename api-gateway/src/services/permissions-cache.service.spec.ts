import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermissionsCacheService } from './permissions-cache.service';
import { RedisService } from './redis.service';
import { UsersProxyService } from './users-proxy.service';

describe('PermissionsCacheService', () => {
  const USER_ID = 'user-1';
  const PERMISSIONS = ['product:manage', 'order:read'];
  const AUTH_STATE = { permissions: PERMISSIONS, status: 'ACTIVE', tokensValidAfter: null };
  let redis: {
    get: jest.Mock;
    setEx: jest.Mock;
    del: jest.Mock;
    delByPattern: jest.Mock;
    mgetOrThrow: jest.Mock;
    eval: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
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
      mgetOrThrow: jest.fn().mockResolvedValue([null, null]),
      eval: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(undefined),
    };
    usersProxyService = { getPermissions: jest.fn().mockResolvedValue(AUTH_STATE) };
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
    // Missing generation counters count as '0'.
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      ['perm:user-1', 'permgen:user-1', 'permgen:all'],
      ['0', '0', JSON.stringify(AUTH_STATE), 60],
    );
  });

  it('writes the fetched value only against the generations read BEFORE the fetch, so an invalidation during the fetch wins (AC4)', async () => {
    redis.get.mockResolvedValue(null);
    redis.mgetOrThrow.mockResolvedValue(['3', '7']);
    // An invalidation lands while user-service is answering.
    usersProxyService.getPermissions.mockImplementation(async () => {
      await service.invalidateUser(USER_ID);
      return AUTH_STATE;
    });

    await expect(service.getPermissions(USER_ID)).resolves.toEqual(PERMISSIONS);

    expect(redis.incr).toHaveBeenCalledWith('permgen:user-1');
    expect(redis.mgetOrThrow).toHaveBeenCalledTimes(1);
    // Conditional write keyed on the pre-fetch generations; no unconditional SET.
    const [script, keys, args] = redis.eval.mock.calls[0];
    expect(script).toContain("redis.call('SET', KEYS[1]");
    expect(keys).toEqual(['perm:user-1', 'permgen:user-1', 'permgen:all']);
    expect(args.slice(0, 2)).toEqual(['3', '7']);
    expect(redis.setEx).not.toHaveBeenCalled();
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
    // Each invalidation also bumps its generation counter (AC4).
    expect(redis.incr).toHaveBeenCalledWith('permgen:user-1');
    expect(redis.incr).toHaveBeenCalledWith('permgen:all');
    expect(redis.expire).toHaveBeenCalledWith('permgen:user-1', 86400);
    expect(redis.expire).toHaveBeenCalledWith('permgen:all', 86400);
  });

  it('after a 5xx from user-service, a cache miss within 10 s throws 503 without calling upstream (AC8)', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      redis.get.mockResolvedValue(null);
      usersProxyService.getPermissions.mockRejectedValueOnce(
        new HttpException('timeout', HttpStatus.GATEWAY_TIMEOUT),
      );

      await expect(service.getAuthState(USER_ID)).rejects.toMatchObject({
        status: HttpStatus.GATEWAY_TIMEOUT,
      });

      now.mockReturnValue(1_000_000 + 9_999);
      await expect(service.getAuthState(USER_ID)).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
      expect(usersProxyService.getPermissions).toHaveBeenCalledTimes(1);

      // Window over: user-service is asked again.
      now.mockReturnValue(1_000_000 + 10_000);
      await expect(service.getAuthState(USER_ID)).resolves.toEqual(AUTH_STATE);
      expect(usersProxyService.getPermissions).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });
});
