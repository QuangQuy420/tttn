import { Module } from '@nestjs/common';
import { BehaviorEventPublisherService } from '../services/behavior-event-publisher.service';
import { EventsController } from './events.controller';

/**
 * Wires `POST /api/events` (behavior events from the browser) to the
 * RabbitMQ `behavior-events` publisher. No upstream HTTP service.
 */
@Module({
  controllers: [EventsController],
  providers: [BehaviorEventPublisherService],
})
export class EventsModule {}
