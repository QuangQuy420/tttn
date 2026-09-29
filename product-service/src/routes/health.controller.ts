import { Controller, Get } from '@nestjs/common';
import { SkipEnvelope } from '../common/skip-envelope.decorator';

/**
 * Plain, no-auth health endpoint — consumed by infra's docker-compose healthcheck, so it
 * keeps the bare `{ status: 'ok' }` body (no envelope).
 */
@Controller('health')
@SkipEnvelope()
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
