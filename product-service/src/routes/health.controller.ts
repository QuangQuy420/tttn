import { Controller, Get } from '@nestjs/common';

/** Plain, no-auth health endpoint — consumed by infra's docker-compose healthcheck. */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
