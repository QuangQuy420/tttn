import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

const SCAN_BATCH_SIZE = 100;

/**
 * Thin wrapper over one `ioredis` client, used as a cache only — Redis is
 * never the source of truth here. Every command fails fast while Redis is
 * down or stalled (no offline queue, one retry, 500 ms command timeout) and
 * errors are logged and swallowed:
 * reads behave as a miss (`null`), writes/deletes become no-ops, so callers
 * fall back to the upstream service instead of returning 500.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  /** Last known state, so connection errors are logged once per change. */
  private available: boolean | undefined;

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.get<AppConfig>('app')!.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
      // A Redis that stops answering with the socket still open must not hang
      // requests: the command rejects and lands in the catch paths below.
      commandTimeout: 500,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    this.client.on('ready', () => {
      if (this.available !== true) {
        this.logger.log('Redis connected — permissions cache enabled');
      }
      this.available = true;
    });
    this.client.on('error', (error: Error) => {
      if (this.available !== false) {
        this.logger.warn(
          `Redis unavailable, cache bypassed: ${error.message}`,
        );
      }
      this.available = false;
    });
  }

  onModuleInit(): void {
    // Never awaited or thrown: the gateway must boot (and keep serving)
    // without Redis; ioredis keeps reconnecting via `retryStrategy`.
    void this.client.connect().catch(() => undefined);
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logFailure('GET', key, error);
      return null;
    }
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logFailure('SETEX', key, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logFailure('DEL', key, error);
    }
  }

  /** Deletes every key matching `pattern` with `SCAN` (never `KEYS`, which blocks Redis). */
  async delByPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          SCAN_BATCH_SIZE,
        );
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
        cursor = next;
      } while (cursor !== '0');
    } catch (error) {
      this.logFailure('SCAN/DEL', pattern, error);
    }
  }

  private logFailure(command: string, key: string, error: unknown): void {
    this.logger.warn(
      `Redis ${command} ${key} failed: ${(error as Error).message}`,
    );
  }
}
