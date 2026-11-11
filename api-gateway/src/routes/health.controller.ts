import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Plain liveness endpoint for the gateway itself. Deliberately makes no
 * downstream calls so it stays green even when `product-service` (or any
 * other internal service) is down — used by `docker compose`'s healthcheck,
 * so it is never rate-limited.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
