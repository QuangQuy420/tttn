import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { AppConfig } from '../config/configuration';

/**
 * One behavior event body on the `behavior-events` exchange — plain JSON,
 * see `infra/contracts/behavior-events.md`. The gateway only publishes the
 * client-side types (VIEW / TRY_ON) on behalf of the browser.
 */
export interface BehaviorEvent {
  eventId: string;
  eventType: 'VIEW' | 'TRY_ON';
  userId: string;
  productId: string;
  occurredAt: string;
  source: 'web';
  context: Record<string, unknown>;
}

const BEHAVIOR_EVENTS_EXCHANGE = 'behavior-events';
// RabbitMQ's healthcheck can report "healthy" slightly before the AMQP listener is ready
// to accept connections, so the first connect attempt on a fresh `docker compose up` can
// lose that race — retry a few times before giving up.
const INITIAL_CONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

/**
 * Publishes behavior events to RabbitMQ via `amqplib` (same connect/retry/reconnect
 * logic as product-service's `RabbitMqProductEventPublisher`). Best effort: publish
 * failures are logged and dropped, never thrown — a broker outage must never break
 * the request. The initial connect runs in the background so gateway boot and
 * `/health` never wait on RabbitMQ.
 */
@Injectable()
export class BehaviorEventPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BehaviorEventPublisherService.name);
  private readonly url: string;
  private connection: amqplib.ChannelModel | undefined;
  private channel: amqplib.Channel | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private shuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    this.url = this.configService.get<AppConfig>('app')!.rabbitmqUrl;
  }

  onModuleInit(): void {
    void this.connectWithRetry(INITIAL_CONNECT_ATTEMPTS);
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (error) {
      this.logger.error(
        'Error while closing RabbitMQ connection',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async connectWithRetry(remainingAttempts: number): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    try {
      await this.connect();
    } catch (error) {
      this.logger.error(
        `Failed to connect to RabbitMQ at ${this.url} (${remainingAttempts} attempt(s) left)`,
        error instanceof Error ? error.stack : String(error),
      );
      if (remainingAttempts > 1) {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
        await this.connectWithRetry(remainingAttempts - 1);
      } else {
        this.logger.error(
          'Giving up on initial RabbitMQ connection — will keep retrying in the background; behavior events will not be published until it reconnects',
        );
        this.scheduleReconnect();
      }
    }
  }

  private async connect(): Promise<void> {
    const connection = await amqplib.connect(this.url);
    connection.on('error', (error) => this.handleDisconnect(error));
    connection.on('close', () =>
      this.handleDisconnect(new Error('connection closed')),
    );
    const channel = await connection.createChannel();
    await channel.assertExchange(BEHAVIOR_EVENTS_EXCHANGE, 'topic', {
      durable: true,
    });
    this.connection = connection;
    this.channel = channel;
  }

  private handleDisconnect(error: Error): void {
    if (this.shuttingDown) {
      return;
    }
    this.channel = undefined;
    this.connection = undefined;
    this.logger.warn(
      `RabbitMQ connection lost (${error.message}) — will retry in the background`,
    );
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    // A single disconnect fires both the connection's 'error' and 'close' events, so this
    // can be called twice for the same failure — the timer guard below makes the second
    // call a no-op rather than scheduling an overlapping reconnect attempt.
    if (this.reconnectTimer || this.shuttingDown) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch((error) => {
        this.logger.error(
          'Background reconnect to RabbitMQ failed',
          error instanceof Error ? error.stack : String(error),
        );
        this.scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
  }

  publish(event: BehaviorEvent): void {
    try {
      if (!this.channel) {
        throw new Error('RabbitMQ channel is not available');
      }
      this.channel.publish(
        BEHAVIOR_EVENTS_EXCHANGE,
        `behavior.${event.eventType.toLowerCase()}`,
        Buffer.from(JSON.stringify(event)),
        {
          persistent: true,
          contentType: 'application/json',
          messageId: event.eventId,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish "${event.eventType}" event ${event.eventId} for product ${event.productId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
