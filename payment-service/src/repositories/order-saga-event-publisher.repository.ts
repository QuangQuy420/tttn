import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

export interface IOrderSagaEventPublisher {
  publishPaymentCompleted(
    orderId: string,
    paymentId: string,
    transactionCode: string,
  ): Promise<void>;
  publishPaymentFailed(orderId: string, reason: string): Promise<void>;
}

export const ORDER_SAGA_EVENTS_EXCHANGE = 'order-saga-events';
// RabbitMQ's healthcheck can report "healthy" slightly before the AMQP listener is ready
// to accept connections, so the first connect attempt on a fresh `docker compose up` can
// lose that race — retry a few times before giving up (same as product-service's
// RabbitMqOrderSagaEventPublisher).
const INITIAL_CONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

/**
 * Publishes payment-service's replies on the checkout saga (`payment.completed` /
 * `payment.failed`) onto the `order-saga-events` topic exchange — see
 * `infra/contracts/order-checkout-saga.md`. Mirrors
 * `product-service/src/repositories/order-saga-event-publisher.repository.ts`'s raw
 * `amqplib` connect/retry/reconnect style exactly. Publish failures are caught and logged,
 * never thrown (NFR1) — a broker outage must never crash the saga consumer that calls this;
 * unlike order-service's one special-cased first publish, nothing here is a "saga's first
 * message," so there is no throw-and-fail-loud case in this service.
 */
@Injectable()
export class RabbitMqOrderSagaEventPublisher
  implements IOrderSagaEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqOrderSagaEventPublisher.name);
  private readonly url: string;
  private connection: amqplib.ChannelModel | undefined;
  private channel: amqplib.Channel | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private shuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('RABBITMQ_URL');
    if (!url) {
      throw new Error('RABBITMQ_URL is not set — check your .env file.');
    }
    this.url = url;
  }

  async onModuleInit(): Promise<void> {
    await this.connectWithRetry(INITIAL_CONNECT_ATTEMPTS);
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
          'Giving up on initial RabbitMQ connection — will keep retrying in the background; saga replies will not be published until it reconnects',
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
    await channel.assertExchange(ORDER_SAGA_EVENTS_EXCHANGE, 'topic', {
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

  async publishPaymentCompleted(
    orderId: string,
    paymentId: string,
    transactionCode: string,
  ): Promise<void> {
    await this.publish(orderId, 'payment.completed', {
      orderId,
      occurredAt: new Date().toISOString(),
      paymentId,
      transactionCode,
    });
  }

  async publishPaymentFailed(orderId: string, reason: string): Promise<void> {
    await this.publish(orderId, 'payment.failed', {
      orderId,
      occurredAt: new Date().toISOString(),
      reason,
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async publish(
    orderId: string,
    routingKey: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      if (!this.channel) {
        throw new Error('RabbitMQ channel is not available');
      }
      this.channel.publish(
        ORDER_SAGA_EVENTS_EXCHANGE,
        routingKey,
        Buffer.from(JSON.stringify(body)),
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish "${routingKey}" event for order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
