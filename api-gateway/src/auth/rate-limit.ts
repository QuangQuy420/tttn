import { SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { verifyBearerToken } from './jwt.guard';

export const RATE_LIMIT_TIER = 'rateLimitTier';

/** Stricter rate-limit buckets; routes without a tier use `RATE_LIMIT_DEFAULT`. */
export type RateLimitTierName = 'auth' | 'faceAnalyze' | 'events';

/**
 * Puts a route on a stricter rate-limit tier. The limit itself is read from
 * config (`RATE_LIMIT_AUTH` / `RATE_LIMIT_FACE_ANALYZE` / `RATE_LIMIT_EVENTS`)
 * by the `ThrottlerModule` factory in `app.module.ts`.
 */
export const RateLimitTier = (tier: RateLimitTierName) =>
  SetMetadata(RATE_LIMIT_TIER, tier);

/**
 * Throttler tracker: the caller's `userId` when the request carries a valid
 * JWT, otherwise the client IP. The throttler runs as an `APP_GUARD`, i.e.
 * BEFORE route guards such as `JwtGuard`, so `request.user` is not set yet —
 * the token is verified here instead (`verifyBearerToken` never throws).
 */
export function userOrIpTracker(
  jwtSecret: string,
): (req: Record<string, any>) => string {
  return (req) =>
    verifyBearerToken(req as Request, jwtSecret)?.userId ??
    (req as Request).ip ??
    'unknown';
}
