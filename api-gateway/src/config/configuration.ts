/**
 * Typed shape of the environment configuration this gateway needs.
 * Keep in sync with `.env.example`.
 */
export interface AppConfig {
  port: number;
  corsOrigin: string;
  downstreamTimeoutMs: number;
  jwtSecret: string;
  internalApiKey: string;
  userServiceUrl: string;
  productServiceUrl: string;
  orderServiceUrl: string;
  faceProcessingServiceUrl: string;
  recommendationServiceUrl: string;
  /** AMQP URL of the broker that receives behavior events (`behavior-events` exchange). */
  rabbitmqUrl: string;
  /** Max events accepted in one `POST /api/events` batch. */
  eventsMaxBatch: number;
  /** Redis used as a cache (permissions). Unreachable Redis = cache bypassed, never an error. */
  redisUrl: string;
  /** Lifetime of a cached `perm:{userId}` entry. */
  permissionsCacheTtlSeconds: number;
  /** Rate-limit window shared by every tier. */
  rateLimitTtlMs: number;
  /** Requests per window per user (valid JWT) or IP — routes without a tier. */
  rateLimitDefault: number;
  /** `@RateLimitTier('auth')`: register / login / forgot-password / reset-password. */
  rateLimitAuth: number;
  /** `@RateLimitTier('faceAnalyze')`: `POST /api/face-analysis/analyze`. */
  rateLimitFaceAnalyze: number;
  /** `@RateLimitTier('events')`: `POST /api/events`. */
  rateLimitEvents: number;
}

/** Env value as a finite positive integer, else `fallback` (a NaN limit would break the throttler). */
function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? '8080', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    downstreamTimeoutMs: parseInt(process.env.DOWNSTREAM_TIMEOUT_MS ?? '5000', 10),
    jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-.env',
    internalApiKey: process.env.INTERNAL_API_KEY ?? 'change-me-in-.env',
    userServiceUrl:
        process.env.USER_SERVICE_URL ?? 'http://localhost:8081',
    productServiceUrl: process.env.PRODUCT_SERVICE_URL ?? 'http://product-service:3002',
    orderServiceUrl: process.env.ORDER_SERVICE_URL ?? 'http://order-service:3003',
    faceProcessingServiceUrl:
      process.env.FACE_PROCESSING_SERVICE_URL ?? 'http://face-processing-service:8000',
    recommendationServiceUrl:
      process.env.RECOMMENDATION_SERVICE_URL ?? 'http://recommendation-service:8000',
    rabbitmqUrl: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@rabbitmq:5672',
    eventsMaxBatch: parseInt(process.env.EVENTS_MAX_BATCH ?? '20', 10),
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    permissionsCacheTtlSeconds: positiveInt(process.env.PERMISSIONS_CACHE_TTL_SECONDS, 60),
    rateLimitTtlMs: positiveInt(process.env.RATE_LIMIT_TTL_MS, 60000),
    rateLimitDefault: positiveInt(process.env.RATE_LIMIT_DEFAULT, 100),
    rateLimitAuth: positiveInt(process.env.RATE_LIMIT_AUTH, 5),
    rateLimitFaceAnalyze: positiveInt(process.env.RATE_LIMIT_FACE_ANALYZE, 10),
    rateLimitEvents: positiveInt(process.env.RATE_LIMIT_EVENTS, 60),
  },
});
