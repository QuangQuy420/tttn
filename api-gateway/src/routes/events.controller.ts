import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/jwt.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import {
  BehaviorEvent,
  BehaviorEventPublisherService,
} from '../services/behavior-event-publisher.service';
import { TrackEventDto, TrackEventsDto } from './dto/track-events.dto';

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_PAST_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * `POST /api/events` — the browser sends batches of VIEW / TRY_ON behavior
 * events; the gateway attaches `userId` from the JWT and publishes each one
 * to the `behavior-events` exchange (`infra/contracts/behavior-events.md`).
 * Guests are accepted but ignored (`{accepted: 0}`, nothing published).
 */
@Controller('api/events')
export class EventsController {
  constructor(private readonly publisher: BehaviorEventPublisherService) {}

  @Post()
  @HttpCode(202)
  @UseGuards(OptionalJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  track(
    @Body() body: TrackEventsDto,
    @Req() request: Request & { user?: AuthenticatedUser },
  ): { accepted: number } {
    const user = request.user;
    if (!user) {
      return { accepted: 0 };
    }

    const now = Date.now();
    for (const dto of body.events) {
      this.publisher.publish(this.toBehaviorEvent(dto, user.userId, now));
    }
    return { accepted: body.events.length };
  }

  private toBehaviorEvent(
    dto: TrackEventDto,
    userId: string,
    now: number,
  ): BehaviorEvent {
    return {
      eventId: dto.eventId,
      eventType: dto.eventType,
      userId,
      productId: dto.productId,
      occurredAt: this.normalizeOccurredAt(dto.occurredAt, now),
      source: 'web',
      context: { ...(dto.context ?? {}) },
    };
  }

  /**
   * Always UTC with `Z` (the consumer rejects zone-less timestamps). A client
   * clock that is > 5 min ahead or an event older than 24 h falls back to
   * server time.
   */
  private normalizeOccurredAt(occurredAt: string, now: number): string {
    const time = new Date(occurredAt).getTime();
    if (
      Number.isNaN(time) ||
      time > now + MAX_FUTURE_SKEW_MS ||
      time < now - MAX_PAST_AGE_MS
    ) {
      return new Date(now).toISOString();
    }
    return new Date(time).toISOString();
  }
}
