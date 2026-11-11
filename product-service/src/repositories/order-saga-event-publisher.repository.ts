import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

export interface IOrderSagaEventPublisher {
  /** Resolves once the broker confirmed the reply; rejects when it could not be delivered. */
  publishStockReserved(orderId: string): Promise<void>;
  /** Same delivery contract as `publishStockReserved()`. */
  publishStockReserveRejected(orderId: string, reason: string): Promise<void>;
}

export const ORDER_SAGA_EVENTS_EXCHANGE = 'order-saga-events';
// Shared dead-letter exchange for the checkout saga queues — a message nacked with
// requeue=false (malformed payload) or that exceeds its queue's `x-delivery-limit` lands
// here instead of being dropped. Only order-service asserts/binds the actual DLQ; this
// service and payment-service just need the exchange to exist so their queue's
// `x-dead-letter-exchange` argument resolves to something.
export const ORDER_SAGA_EVENTS_DLX = 'order-saga-events.dlx';
// RabbitMQ's healthcheck can report "healthy" slightly before the AMQP listener is ready
// to accept connections, so the first connect attempt on a fresh `docker compose up` can
// lose that race — retry a few times before giving up (same as RabbitMqProductEventPublisher).
const INITIAL_CONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

/**
 * Publishes product-service's replies on the checkout saga (`stock.reserved` /
 * `stock.reserve.rejected`) onto the `order-saga-events` topic exchange — see
 * `infra/contracts/order-checkout-saga.md`. This is a distinct bounded concern from
 * `RabbitMqProductEventPublisher`'s `product-events` exchange (catalog change
 * notifications), so it gets its own connection/channel rather than reusing that class.
 * Mirrors its raw `amqplib` connect/retry/reconnect style exactly. Replies are persistent
 * and sent on a confirm channel: a publish with no channel, or one the broker nacks / never
 * confirms (channel closed), is logged and REJECTS, so `OrderSagaEventConsumer` nacks the
 * request with requeue instead of acking it with the reply lost (NFR3). It never crashes
 * the process.
 */
@Injectable()
export class RabbitMqOrderSagaEventPublisher
  implements IOrderSagaEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqOrderSagaEventPublisher.name);
  private readonly url: string;
  private connection: amqplib.ChannelModel | undefined;
  private channel: amqplib.ConfirmChannel | undefined;
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
    // Listeners act only while this connection is the current one (see handleDisconnect).
    connection.on('error', (error: Error) =>
      this.handleDisconnect(connection, error),
    );
    connection.on('close', () =>
      this.handleDisconnect(connection, new Error('connection closed')),
    );
    try {
      const channel = await connection.createConfirmChannel();
      // Without an 'error' listener a channel error is thrown as an unhandled 'error' event.
      channel.on('error', (error: Error) =>
        this.handleDisconnect(connection, error),
      );
      channel.on('close', () =>
        this.handleDisconnect(connection, new Error('channel closed')),
      );
      await channel.assertExchange(ORDER_SAGA_EVENTS_EXCHANGE, 'topic', {
        durable: true,
      });
      this.connection = connection;
      this.channel = channel;
    } catch (error) {
      connection.close().catch(() => undefined);
      throw error;
    }
  }

  private handleDisconnect(
    connection: amqplib.ChannelModel,
    error: Error,
  ): void {
    if (this.shuttingDown || this.connection !== connection) {
      return;
    }
    this.channel = undefined;
    this.connection = undefined;
    this.logger.warn(
      `RabbitMQ connection lost (${error.message}) — will retry in the background`,
    );
    // A channel-level failure leaves the connection open — close it so it does not leak.
    connection.close().catch(() => undefined);
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

  async publishStockReserved(orderId: string): Promise<void> {
    await this.publish(orderId, 'stock.reserved', {
      orderId,
      occurredAt: new Date().toISOString(),
    });
  }

  async publishStockReserveRejected(
    orderId: string,
    reason: string,
  ): Promise<void> {
    await this.publish(orderId, 'stock.reserve.rejected', {
      orderId,
      reason,
      occurredAt: new Date().toISOString(),
    });
  }

  private async publish(
    orderId: string,
    routingKey: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.publishConfirmed(routingKey, body);
    } catch (error) {
      this.logger.error(
        `Failed to publish "${routingKey}" event for order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /** Resolves on the broker's ack; rejects on nack, on a closed channel, or with no channel. */
  private publishConfirmed(
    routingKey: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const channel = this.channel;
    if (!channel) {
      return Promise.reject(new Error('RabbitMQ channel is not available'));
    }
    return new Promise<void>((resolve, reject) => {
      try {
        channel.publish(
          ORDER_SAGA_EVENTS_EXCHANGE,
          routingKey,
          Buffer.from(JSON.stringify(body)),
          { persistent: true },
          (error: unknown) => {
            if (error) {
              reject(
                error instanceof Error ? error : new Error('message nacked'),
              );
            } else {
              resolve();
            }
          },
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}
