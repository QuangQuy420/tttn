import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { PaymentsService } from '../services/payments.service';
import {
  ORDER_SAGA_EVENTS_DLX,
  ORDER_SAGA_EVENTS_EXCHANGE,
} from './order-saga-event-publisher.repository';

interface PaymentCreateRequestedPayload {
  orderId: string;
  userId: string;
  orderCode: string;
  amount: number;
  paymentMethod: string;
}

interface PaymentRefundRequestedPayload {
  orderId: string;
  reason?: string;
}

const QUEUE_NAME = 'payment-service.order-saga-events';
const PAYMENT_CREATE_REQUESTED = 'payment.create.requested';
const PAYMENT_REFUND_REQUESTED = 'payment.refund.requested';
// Same retry/backoff constants as RabbitMqOrderSagaEventPublisher — see that file for why.
const INITIAL_CONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;
// How many times RabbitMQ redelivers a nacked-and-requeued message (via the queue's quorum
// `x-delivery-limit`) before routing it to the DLX instead — broker-enforced, no code-side
// counting needed. Same default/env var as order-service and product-service.
const DEFAULT_SAGA_QUEUE_DELIVERY_LIMIT = 10;

/**
 * Consumes the checkout saga's `payment.create.requested` step and the cancel flow's
 * `payment.refund.requested` off the `order-saga-events` topic exchange (see
 * `infra/contracts/order-checkout-saga.md`). Mirrors
 * `product-service/src/repositories/order-saga-event-consumer.repository.ts`'s raw
 * `amqplib` connect/retry/reconnect style. Manually acks after the handler completes, nacks
 * + requeues on unexpected (e.g. transient DB) errors so a broker restart or brief DB blip
 * doesn't drop a saga message (NFR1). Domain outcomes (success/failure of the mock payment
 * decision) are not errors here — `PaymentsService.processPayment()` always resolves
 * normally and replies over the publisher itself.
 *
 * A message that fails to parse as JSON or is missing required fields is a permanent,
 * non-retryable failure — requeuing it would loop forever and, combined with `prefetch(1)`,
 * block every other message behind it, so such a message is nacked with `requeue=false`
 * and logged loudly. The queue's `x-dead-letter-exchange` argument (see `connect()`) routes
 * it to the shared `order-saga-events.dlx` instead of dropping it — same for any message
 * that exceeds the queue's `x-delivery-limit` from repeated nack-and-requeue. This class's
 * own nack/ack decisions are unchanged either way; only the queue declaration knows about
 * the DLX.
 *
 * A dropped connection or channel never crashes the process: `ack` / `nack` on a closed
 * channel are logged (the broker redelivers the unacked message after reconnect), handler
 * rejections are caught, and channel `error` / `close` trigger the same background reconnect
 * as a lost connection.
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
    private readonly paymentsService: PaymentsService,
  ) {
    const url = this.configService.get<string>('RABBITMQ_URL');
    if (!url) {
      throw new Error('RABBITMQ_URL is not set — check your .env file.');
    }
    this.url = url;
    this.deliveryLimit = parseInt(
      this.configService.get<string>('SAGA_QUEUE_DELIVERY_LIMIT') ??
        String(DEFAULT_SAGA_QUEUE_DELIVERY_LIMIT),
      10,
    );
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
    // Only the active connection may trigger a reconnect — events from a connection that
    // failed setup (closed below) or was already replaced are ignored.
    connection.on('error', (error) => {
      if (this.connection === connection) {
        this.handleDisconnect(error);
      }
    });
    connection.on('close', () => {
      if (this.connection === connection) {
        this.handleDisconnect(new Error('connection closed'));
      }
    });
    try {
      const channel = await connection.createChannel();
      // A channel-level error (e.g. acking on a stale delivery tag) closes only the channel;
      // without a listener the 'error' event would crash the process. 'close' drops the whole
      // connection and reconnects so consuming resumes on a fresh channel.
      channel.on('error', (error: Error) =>
        this.logger.warn(`RabbitMQ channel error: ${error.message}`),
      );
      channel.on('close', () => {
        if (this.shuttingDown || this.channel !== channel) {
          return;
        }
        this.handleDisconnect(new Error('channel closed'));
        connection.close().catch(() => undefined);
      });
      await channel.assertExchange(ORDER_SAGA_EVENTS_EXCHANGE, 'topic', {
        durable: true,
      });
      // Shared DLX for the saga queues (idempotent to assert repeatedly). Only order-service
      // asserts/binds the actual DLQ — this just ensures the exchange this queue's
      // `x-dead-letter-exchange` argument points at actually exists.
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
        PAYMENT_CREATE_REQUESTED,
      );
      await channel.bindQueue(
        queue.queue,
        ORDER_SAGA_EVENTS_EXCHANGE,
        PAYMENT_REFUND_REQUESTED,
      );
      await channel.prefetch(1);
      // Set before consume() so the channel 'close' guard above already sees this channel
      // as the active one when the first delivery arrives.
      this.connection = connection;
      this.channel = channel;
      await channel.consume(queue.queue, (msg) => {
        if (msg) {
          this.handleMessage(channel, msg).catch((error) =>
            this.logger.error(
              `Unexpected error while handling "${msg.fields.routingKey}" message`,
              error instanceof Error ? error.stack : String(error),
            ),
          );
        }
      });
    } catch (error) {
      this.channel = undefined;
      this.connection = undefined;
      connection.close().catch(() => undefined);
      throw error;
    }
  }

  private async handleMessage(
    channel: amqplib.Channel,
    msg: amqplib.ConsumeMessage,
  ): Promise<void> {
    const routingKey = msg.fields.routingKey;
    let handle: () => Promise<void>;
    try {
      handle = this.buildHandler(routingKey, msg);
    } catch (error) {
      // Permanent failure — the message itself is malformed, so redelivery would never
      // succeed. Drop it (no dead-letter exchange configured) instead of requeuing forever
      // and blocking every message behind it under prefetch(1).
      this.logger.error(
        `Dropping malformed "${routingKey}" message — nacking without requeue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.settle(msg, () => channel.nack(msg, false, false));
      return;
    }

    try {
      await handle();
      this.settle(msg, () => channel.ack(msg));
    } catch (error) {
      this.logger.error(
        `Failed to handle "${routingKey}" message — nacking for redelivery in ${RECONNECT_DELAY_MS} ms`,
        error instanceof Error ? error.stack : String(error),
      );
      // Wait before requeueing: under prefetch(1) an immediate requeue comes straight back,
      // so a short outage (e.g. the publisher still reconnecting) would burn every quorum
      // delivery and dead-letter a valid request. unref() so the timer never holds the
      // process open on shutdown; settling on a closed channel is already safe.
      await new Promise((resolve) =>
        setTimeout(resolve, RECONNECT_DELAY_MS).unref(),
      );
      this.settle(msg, () => channel.nack(msg, false, true));
    }
  }

  /**
   * Parses the body for the given routing key and returns the call to run. Throws
   * (synchronously) on invalid JSON or a missing/wrong-typed required field — the caller
   * treats that as a permanent, non-retryable failure.
   */
  private buildHandler(
    routingKey: string,
    msg: amqplib.ConsumeMessage,
  ): () => Promise<void> {
    if (routingKey === PAYMENT_CREATE_REQUESTED) {
      const payload = this.parseCreatePayload(this.parseJson(msg));
      return () =>
        this.paymentsService.processPayment(
          payload.orderId,
          payload.userId,
          payload.orderCode,
          payload.amount,
          payload.paymentMethod,
        );
    }
    if (routingKey === PAYMENT_REFUND_REQUESTED) {
      const payload = this.parseRefundPayload(this.parseJson(msg));
      return () =>
        this.paymentsService.refundPayment(payload.orderId, payload.reason);
    }
    return () => {
      this.logger.warn(
        `Ignoring message with unexpected routing key "${routingKey}"`,
      );
      return Promise.resolve();
    };
  }

  /**
   * Acks / nacks without throwing: when the channel closed mid-handling the call throws, the
   * message stays unacked and the broker redelivers it on the next connection — handlers are
   * idempotent, so that is safe.
   */
  private settle(msg: amqplib.ConsumeMessage, action: () => void): void {
    try {
      action();
    } catch (error) {
      this.logger.warn(
        `Could not ack/nack "${msg.fields.routingKey}" message (channel closed?) — the broker will redeliver it: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private parseJson(msg: amqplib.ConsumeMessage): unknown {
    try {
      return JSON.parse(msg.content.toString()) as unknown;
    } catch {
      throw new Error('message body is not valid JSON');
    }
  }

  private parseCreatePayload(parsed: unknown): PaymentCreateRequestedPayload {
    const candidate = parsed as Partial<PaymentCreateRequestedPayload> | null;
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      typeof candidate.orderId !== 'string' ||
      typeof candidate.userId !== 'string' ||
      typeof candidate.orderCode !== 'string' ||
      typeof candidate.amount !== 'number' ||
      typeof candidate.paymentMethod !== 'string'
    ) {
      throw new Error(
        'message payload is missing required "orderId"/"userId"/"orderCode"/"amount"/"paymentMethod" fields',
      );
    }
    return candidate as PaymentCreateRequestedPayload;
  }

  private parseRefundPayload(parsed: unknown): PaymentRefundRequestedPayload {
    const candidate = parsed as Partial<PaymentRefundRequestedPayload> | null;
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      typeof candidate.orderId !== 'string'
    ) {
      throw new Error('message payload is missing required "orderId" field');
    }
    return {
      orderId: candidate.orderId,
      reason:
        typeof candidate.reason === 'string' ? candidate.reason : undefined,
    };
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
}
