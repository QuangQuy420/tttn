import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

export interface ProductEvent {
  type: 'product.updated' | 'product.deleted';
  productId: string;
}

export interface IProductEventPublisher {
  publish(event: ProductEvent): Promise<void>;
}

const PRODUCT_EVENTS_EXCHANGE = 'product-events';
// RabbitMQ's healthcheck can report "healthy" slightly before the AMQP listener is ready
// to accept connections, so the first connect attempt on a fresh `docker compose up` can
// lose that race — retry a few times before giving up.
const INITIAL_CONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;
// Upper bound on events kept while the broker is unreachable (one entry per type+product).
const MAX_PENDING_EVENTS = 1000;

/**
 * Wraps `amqplib` against RabbitMQ to publish product lifecycle events (T8). Publish
 * failures are caught and logged, never thrown — a broker outage must never break the
 * admin's update/delete request (NFR4). Reconnects automatically (in the background, never
 * blocking a request) if the connection drops after startup.
 *
 * Messages are persistent JSON. An event that cannot be handed to a channel (no channel, or
 * `publish` throws on a closing one) is kept in a bounded, de-duplicated in-memory set and
 * re-sent right after the next successful connect, so consumers (cart sync) still catch up
 * after a broker blip. The set is lost on a process restart (not a durable outbox).
 */
@Injectable()
export class RabbitMqProductEventPublisher
  implements IProductEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqProductEventPublisher.name);
  private readonly url: string;
  private connection: amqplib.ChannelModel | undefined;
  private channel: amqplib.Channel | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private shuttingDown = false;
  /** Key `${type}|${productId}` → event; insertion order = send order. */
  private readonly pending = new Map<string, ProductEvent>();

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
          'Giving up on initial RabbitMQ connection — will keep retrying in the background; product events will not be published until it reconnects',
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
      const channel = await connection.createChannel();
      // Without an 'error' listener a channel error is thrown as an unhandled 'error' event.
      channel.on('error', (error: Error) =>
        this.handleDisconnect(connection, error),
      );
      channel.on('close', () =>
        this.handleDisconnect(connection, new Error('channel closed')),
      );
      await channel.assertExchange(PRODUCT_EVENTS_EXCHANGE, 'topic', {
        durable: true,
      });
      this.connection = connection;
      this.channel = channel;
    } catch (error) {
      connection.close().catch(() => undefined);
      throw error;
    }
    this.flushPending();
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

  // eslint-disable-next-line @typescript-eslint/require-await
  async publish(event: ProductEvent): Promise<void> {
    if (!this.trySend(event)) {
      this.addPending(event);
    }
  }

  /** Hands `event` to the current channel; `false` (logged) when that is not possible. */
  private trySend(event: ProductEvent): boolean {
    try {
      if (!this.channel) {
        throw new Error('RabbitMQ channel is not available');
      }
      const body = {
        productId: event.productId,
        occurredAt: new Date().toISOString(),
      };
      this.channel.publish(
        PRODUCT_EVENTS_EXCHANGE,
        event.type,
        Buffer.from(JSON.stringify(body)),
        { persistent: true, contentType: 'application/json' },
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to publish "${event.type}" event for product ${event.productId} — kept for re-send after reconnect`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  private addPending(event: ProductEvent): void {
    const key = `${event.type}|${event.productId}`;
    // Re-insert so a repeated event moves to the end (sent after older ones).
    this.pending.delete(key);
    if (this.pending.size >= MAX_PENDING_EVENTS) {
      const [oldestKey] = this.pending.keys();
      if (oldestKey !== undefined) {
        this.pending.delete(oldestKey);
        this.logger.warn(
          `Pending product events full (${MAX_PENDING_EVENTS}) — dropped the oldest (${oldestKey})`,
        );
      }
    }
    this.pending.set(key, event);
  }

  /** Re-sends events kept while the channel was down; stops at the first failure. */
  private flushPending(): void {
    if (this.pending.size === 0) {
      return;
    }
    this.logger.log(
      `Re-sending ${this.pending.size} product event(s) kept while RabbitMQ was unavailable`,
    );
    for (const [key, event] of [...this.pending.entries()]) {
      if (!this.trySend(event)) {
        return;
      }
      this.pending.delete(key);
    }
  }
}
