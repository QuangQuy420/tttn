import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { InventoryService } from '../services/inventory.service';
import { ReserveItem } from './inventory.repository';
import {
  ORDER_SAGA_EVENTS_DLX,
  ORDER_SAGA_EVENTS_EXCHANGE,
} from './order-saga-event-publisher.repository';

interface StockRequestedPayload {
  orderId: string;
  items: ReserveItem[];
}

/** `payment.completed` and `stock.restock.requested` — only `orderId` is read. */
interface OrderOnlyPayload {
  orderId: string;
}

type SagaPayload = StockRequestedPayload | OrderOnlyPayload;

const QUEUE_NAME = 'product-service.order-saga-events';
const STOCK_RESERVE_REQUESTED = 'stock.reserve.requested';
const STOCK_RELEASE_REQUESTED = 'stock.release.requested';
const STOCK_RESTOCK_REQUESTED = 'stock.restock.requested';
const PAYMENT_COMPLETED = 'payment.completed';
// Same retry/backoff constants as RabbitMqProductEventPublisher — see that file for why.
const INITIAL_CONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;
// How many times RabbitMQ redelivers a nacked-and-requeued saga message before routing it
// to the dead-letter exchange instead (broker-enforced via the quorum queue's
// `x-delivery-limit` — no code-side counting needed). Configurable via
// `SAGA_QUEUE_DELIVERY_LIMIT` so it can be tuned without a code change.
const DEFAULT_SAGA_QUEUE_DELIVERY_LIMIT = 10;

/**
 * Consumes the checkout saga's stock steps (`stock.reserve.requested` /
 * `stock.release.requested` / `payment.completed` / `stock.restock.requested`) off the
 * `order-saga-events` topic exchange (T-PS-3). Mirrors
 * `RabbitMqProductEventPublisher`'s raw `amqplib` connect/retry/reconnect style. Manually
 * acks after the handler completes; nacks + requeues on unexpected (e.g. transient DB)
 * errors so a broker restart or brief DB blip doesn't drop a saga message (NFR3). Domain
 * rejections (insufficient stock) are not errors here — `InventoryService.reserve()`
 * already turns those into a `stock.reserve.rejected` reply and resolves normally.
 *
 * A message that fails to parse as JSON or is missing required fields is a permanent,
 * non-retryable failure — requeuing it would loop forever and, combined with `prefetch(1)`,
 * block every other message behind it. It's nacked with `requeue=false`, which (via the
 * queue's `x-dead-letter-exchange`) routes it to the shared `order-saga-events.dlx` instead
 * of dropping it. The queue's `x-delivery-limit` gives the same landing spot to a message
 * that keeps getting nacked-and-requeued (see `connect()`). Everything from
 * `InventoryService.reserve()`/`release()` downward keeps the existing nack-with-requeue
 * behavior — those failures are expected to be transient or are already handled internally.
 *
 * A dropped broker connection or channel must never crash the process: `ack`/`nack` on a
 * closed channel are logged (the broker redelivers the unacked message), the handler's
 * promise is always caught, and channel `error`/`close` trigger the same background
 * reconnect as the connection's.
 */
@Injectable()
export class OrderSagaEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderSagaEventConsumer.name);
  private readonly url: string;
  private readonly deliveryLimit: number;
  private connection: amqplib.ChannelModel | undefined;
  private channel: amqplib.Channel | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private shuttingDown = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly inventoryService: InventoryService,
  ) {
    const url = this.configService.get<string>('RABBITMQ_URL');
    if (!url) {
      throw new Error('RABBITMQ_URL is not set — check your .env file.');
    }
    this.url = url;
    const rawDeliveryLimit = this.configService.get<string>(
      'SAGA_QUEUE_DELIVERY_LIMIT',
    );
    const parsedDeliveryLimit = rawDeliveryLimit
      ? parseInt(rawDeliveryLimit, 10)
      : NaN;
    this.deliveryLimit = Number.isFinite(parsedDeliveryLimit)
      ? parsedDeliveryLimit
      : DEFAULT_SAGA_QUEUE_DELIVERY_LIMIT;
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
          'Giving up on initial RabbitMQ connection — will keep retrying in the background; order saga messages will not be consumed until it reconnects',
        );
        this.scheduleReconnect();
      }
    }
  }

  private async connect(): Promise<void> {
    const connection = await amqplib.connect(this.url);
    // Listeners act only while this connection is the current one (see handleDisconnect),
    // so a half-opened connection closed below never schedules a second reconnect.
    connection.on('error', (error: Error) =>
      this.handleDisconnect(connection, error),
    );
    connection.on('close', () =>
      this.handleDisconnect(connection, new Error('connection closed')),
    );
    try {
      await this.setUpChannel(connection);
    } catch (error) {
      this.closeQuietly(connection);
      throw error;
    }
  }

  private async setUpChannel(connection: amqplib.ChannelModel): Promise<void> {
    const channel = await connection.createChannel();
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
    // Idempotent — order-service owns asserting/binding the actual DLQ onto this exchange.
    // This service only needs the exchange itself to exist so the queue's
    // `x-dead-letter-exchange` argument below resolves to something.
    await channel.assertExchange(ORDER_SAGA_EVENTS_DLX, 'fanout', {
      durable: true,
    });
    const queue = await channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum',
        'x-dead-letter-exchange': ORDER_SAGA_EVENTS_DLX,
        'x-delivery-limit': this.deliveryLimit,
      },
    });
    await channel.bindQueue(
      queue.queue,
      ORDER_SAGA_EVENTS_EXCHANGE,
      STOCK_RESERVE_REQUESTED,
    );
    await channel.bindQueue(
      queue.queue,
      ORDER_SAGA_EVENTS_EXCHANGE,
      STOCK_RELEASE_REQUESTED,
    );
    await channel.bindQueue(
      queue.queue,
      ORDER_SAGA_EVENTS_EXCHANGE,
      PAYMENT_COMPLETED,
    );
    await channel.bindQueue(
      queue.queue,
      ORDER_SAGA_EVENTS_EXCHANGE,
      STOCK_RESTOCK_REQUESTED,
    );
    await channel.prefetch(1);
    await channel.consume(queue.queue, (msg) => {
      if (msg) {
        this.handleMessage(channel, msg).catch((error) =>
          this.logger.error(
            `Unhandled error while handling "${msg.fields.routingKey}" message`,
            error instanceof Error ? error.stack : String(error),
          ),
        );
      }
    });
    this.connection = connection;
    this.channel = channel;
  }

  private async handleMessage(
    channel: amqplib.Channel,
    msg: amqplib.ConsumeMessage,
  ): Promise<void> {
    const routingKey = msg.fields.routingKey;
    let payload: SagaPayload;
    try {
      payload = this.parsePayload(
        msg,
        routingKey === STOCK_RESERVE_REQUESTED ||
          routingKey === STOCK_RELEASE_REQUESTED,
      );
    } catch (error) {
      // Permanent failure — the message itself is malformed, so redelivery would never
      // succeed. Drop it (no dead-letter exchange configured) instead of requeuing forever
      // and blocking every message behind it under prefetch(1).
      this.logger.error(
        `Dropping malformed "${routingKey}" message — nacking without requeue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.settle(channel, msg, 'nack', false);
      return;
    }

    try {
      if (routingKey === STOCK_RESERVE_REQUESTED) {
        await this.inventoryService.reserve(
          payload.orderId,
          (payload as StockRequestedPayload).items,
        );
      } else if (routingKey === STOCK_RELEASE_REQUESTED) {
        await this.inventoryService.release(
          payload.orderId,
          (payload as StockRequestedPayload).items,
        );
      } else if (routingKey === PAYMENT_COMPLETED) {
        await this.inventoryService.commit(payload.orderId);
      } else if (routingKey === STOCK_RESTOCK_REQUESTED) {
        await this.inventoryService.restock(payload.orderId);
      } else {
        this.logger.warn(
          `Ignoring message with unexpected routing key "${routingKey}"`,
        );
      }
      this.settle(channel, msg, 'ack');
    } catch (error) {
      this.logger.error(
        `Failed to handle "${routingKey}" message — nacking for redelivery in ${RECONNECT_DELAY_MS} ms`,
        error instanceof Error ? error.stack : String(error),
      );
      // Under prefetch(1) a requeued message comes back within milliseconds; without a pause
      // a short outage (e.g. the reply publisher reconnecting) would burn every quorum
      // delivery and dead-letter a valid request.
      await new Promise((resolve) =>
        setTimeout(resolve, RECONNECT_DELAY_MS).unref(),
      );
      this.settle(channel, msg, 'nack', true);
    }
  }

  /**
   * `ack`/`nack` throw on a channel that closed while the message was being handled. The
   * broker redelivers every unacked message of a closed channel, so logging is enough.
   */
  private settle(
    channel: amqplib.Channel,
    msg: amqplib.ConsumeMessage,
    action: 'ack' | 'nack',
    requeue = false,
  ): void {
    try {
      if (action === 'ack') {
        channel.ack(msg);
      } else {
        channel.nack(msg, false, requeue);
      }
    } catch (error) {
      this.logger.warn(
        `Could not ${action} "${msg.fields.routingKey}" message — channel is gone, the broker will redeliver it: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Parses and shape-checks the message body. Throws (synchronously) on invalid JSON or a
   * missing/wrong-typed `orderId` (or `items` for stock messages) — the caller treats that as a permanent,
   * non-retryable failure. Stock items must have a string `variantId` and a positive integer
   * `quantity`; repeated `variantId`s are merged by summing their quantities.
   */
  private parsePayload(
    msg: amqplib.ConsumeMessage,
    requiresItems: boolean,
  ): SagaPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg.content.toString());
    } catch {
      throw new Error('message body is not valid JSON');
    }
    const candidate = parsed as Partial<StockRequestedPayload> | null;
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      typeof candidate.orderId !== 'string' ||
      (requiresItems && !Array.isArray(candidate.items))
    ) {
      throw new Error(
        requiresItems
          ? 'message payload is missing required "orderId"/"items" fields'
          : 'message payload is missing required "orderId" field',
      );
    }
    if (!requiresItems) {
      return { orderId: candidate.orderId };
    }
    return {
      orderId: candidate.orderId,
      items: this.mergeItems(candidate.items as unknown[]),
    };
  }

  private mergeItems(rawItems: unknown[]): ReserveItem[] {
    const quantitiesByVariant = new Map<string, number>();
    for (const raw of rawItems) {
      const item = raw as Partial<ReserveItem> | null;
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof item.variantId !== 'string' ||
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new Error(
          'every item needs a string "variantId" and a positive integer "quantity"',
        );
      }
      quantitiesByVariant.set(
        item.variantId,
        (quantitiesByVariant.get(item.variantId) ?? 0) + item.quantity,
      );
    }
    return [...quantitiesByVariant.entries()].map(([variantId, quantity]) => ({
      variantId,
      quantity,
    }));
  }

  private handleDisconnect(
    connection: amqplib.ChannelModel,
    error: Error,
  ): void {
    // Ignore events from a connection that is not (or no longer) the current one: a
    // half-opened attempt that connect() already closed, or one replaced by a reconnect.
    if (this.shuttingDown || this.connection !== connection) {
      return;
    }
    this.channel = undefined;
    this.connection = undefined;
    this.logger.warn(
      `RabbitMQ connection lost (${error.message}) — will retry in the background`,
    );
    // A channel-level failure leaves the connection open — close it so it does not leak.
    this.closeQuietly(connection);
    this.scheduleReconnect();
  }

  private closeQuietly(connection: amqplib.ChannelModel): void {
    connection.close().catch(() => undefined);
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
}
