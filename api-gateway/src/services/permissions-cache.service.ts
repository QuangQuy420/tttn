import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RedisService } from './redis.service';
import { UserAuthState, UsersProxyService } from './users-proxy.service';

const KEY_PREFIX = 'perm:';
const GENERATION_PREFIX = 'permgen:';
const GLOBAL_GENERATION_KEY = `${GENERATION_PREFIX}all`;
/** Generation counters only need to outlive in-flight fetches and the cache TTL. */
const GENERATION_TTL_SECONDS = 24 * 60 * 60;
/** After user-service fails (no response / 5xx), skip it for this long. */
const UNAVAILABLE_BACKOFF_MS = 10_000;

/**
 * Writes the cache entry (KEYS[1]) only when neither the user's generation
 * (KEYS[2]) nor the global one (KEYS[3]) moved since they were read before
 * the upstream fetch (ARGV[1], ARGV[2]). A missing counter counts as "0" —
 * the keys exist only after the first invalidation.
 */
const SET_IF_GENERATIONS_UNCHANGED = `
if (redis.call('GET', KEYS[2]) or '0') == ARGV[1]
  and (redis.call('GET', KEYS[3]) or '0') == ARGV[2] then
  redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
  return 1
end
return 0
`;

/**
 * Cache-aside in front of `UsersProxyService.getPermissions`: `perm:{userId}`
 * holds `{ permissions, status, tokensValidAfter }` in Redis for
 * `PERMISSIONS_CACHE_TTL_SECONDS` (60 s) and is deleted right after a
 * successful role or password change made through the gateway
 * (`UsersController` / `RolesController`). A miss or a Redis failure falls
 * back to user-service, so Redis being down only costs latency.
 *
 * Invalidation wins over an in-flight fetch: every invalidation bumps a
 * generation counter (`permgen:{userId}` or `permgen:all`), and the fetched
 * value is written by one Lua script only if both counters are unchanged.
 *
 * When user-service fails with no response or a 5xx, later cache misses fail
 * at once with a 503 for `UNAVAILABLE_BACKOFF_MS` (per gateway instance)
 * instead of each waiting for the upstream timeout: `JwtGuard` then fails
 * open and `PermissionsGuard` fails closed without delay.
 */
@Injectable()
export class PermissionsCacheService {
  private readonly logger = new Logger(PermissionsCacheService.name);
  private readonly ttlSeconds: number;
  /** Epoch ms until which user-service is treated as down; 0 = available. */
  private unavailableUntil = 0;

  constructor(
    private readonly redisService: RedisService,
    private readonly usersProxyService: UsersProxyService,
    configService: ConfigService,
  ) {
    this.ttlSeconds =
      configService.get<AppConfig>('app')!.permissionsCacheTtlSeconds;
  }

  /** Permission codes only — what `PermissionsGuard` checks. */
  async getPermissions(userId: string): Promise<string[]> {
    return (await this.getAuthState(userId)).permissions;
  }

  /**
   * Permissions plus account status and token cut-off. Throws the upstream
   * `HttpException` on a miss when user-service fails (404 = user gone,
   * 503 / 504 = unreachable, also thrown right away during the backoff).
   */
  async getAuthState(userId: string): Promise<UserAuthState> {
    const key = this.keyFor(userId);
    const cached = this.parse(await this.redisService.get(key));
    if (cached) {
      return cached;
    }

    if (Date.now() < this.unavailableUntil) {
      throw new HttpException(
        'Không thể kết nối tới user-service',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const userGenerationKey = this.generationKeyFor(userId);
    let generations: (string | null)[] | null;
    try {
      generations = await this.redisService.mgetOrThrow(
        userGenerationKey,
        GLOBAL_GENERATION_KEY,
      );
    } catch {
      // Redis unreachable: the write below would fail too — skip it.
      generations = null;
    }

    const state = await this.fetchAuthState(userId);
    if (generations) {
      await this.redisService.eval(
        SET_IF_GENERATIONS_UNCHANGED,
        [key, userGenerationKey, GLOBAL_GENERATION_KEY],
        [
          generations[0] ?? '0',
          generations[1] ?? '0',
          JSON.stringify(state),
          this.ttlSeconds,
        ],
      );
    }
    return state;
  }

  private async fetchAuthState(userId: string): Promise<UserAuthState> {
    try {
      const state = await this.usersProxyService.getPermissions(userId);
      this.unavailableUntil = 0;
      return state;
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR
      ) {
        if (this.unavailableUntil === 0) {
          this.logger.warn(
            `user-service failed (${error.getStatus()}), skipping it for ${UNAVAILABLE_BACKOFF_MS} ms`,
          );
        }
        this.unavailableUntil = Date.now() + UNAVAILABLE_BACKOFF_MS;
      }
      throw error;
    }
  }

  /** After a role is assigned to / removed from one user, or a password change. */
  async invalidateUser(userId: string): Promise<void> {
    await this.bumpGeneration(this.generationKeyFor(userId));
    await this.redisService.del(this.keyFor(userId));
  }

  /** After a role itself is updated or deleted — any user may hold it. */
  async invalidateAll(): Promise<void> {
    await this.bumpGeneration(GLOBAL_GENERATION_KEY);
    await this.redisService.delByPattern(`${KEY_PREFIX}*`);
  }

  private async bumpGeneration(key: string): Promise<void> {
    await this.redisService.incr(key);
    await this.redisService.expire(key, GENERATION_TTL_SECONDS);
  }

  /**
   * JWT `userId`s are lower-case UUIDs while a path `:id` may be upper-case:
   * both sides normalise here so a read and its invalidation hit the same key.
   */
  private keyFor(userId: string): string {
    return `${KEY_PREFIX}${userId.toLowerCase()}`;
  }

  private generationKeyFor(userId: string): string {
    return `${GENERATION_PREFIX}${userId.toLowerCase()}`;
  }

  /**
   * Accepts the current object shape and the legacy plain array (entries
   * written before token revocation existed; no status / cut-off known).
   */
  private parse(value: string | null): UserAuthState | null {
    if (value === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return {
          permissions: parsed as string[],
          status: null,
          tokensValidAfter: null,
        };
      }
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as UserAuthState).permissions)
      ) {
        const state = parsed as Partial<UserAuthState>;
        return {
          permissions: state.permissions!,
          status: state.status ?? null,
          tokensValidAfter: state.tokensValidAfter ?? null,
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
