import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment } from '../db/entities/payment.entity';
import { PaymentStatus } from '../db/enums/payment-status.enum';
import { IPaymentRepository } from '../repositories/payment.repository';
import { IOrderSagaEventPublisher } from '../repositories/order-saga-event-publisher.repository';
import {
  PAYMENT_REPOSITORY,
  ORDER_SAGA_EVENT_PUBLISHER,
} from '../repositories/tokens';

const SUPPORTED_PAYMENT_METHOD = 'CARD';
const DEFAULT_MIN_CARD_AMOUNT = 1_000_000;

/**
 * Orchestrates the checkout saga's payment step for `OrderSagaEventConsumer`:
 * `payment.create.requested` in, `payment.completed`/`payment.failed` out. Mock provider —
 * there's no real bank/card gateway in this project (see plan's Risks & dependencies), so
 * the outcome is decided by a fixed rule (FR1) rather than an external call. Thin —
 * delegates persistence to `IPaymentRepository` and idempotency bookkeeping is just "does a
 * row already exist for this order id", and replies via `IOrderSagaEventPublisher`.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly minCardAmount: number;

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
    @Inject(ORDER_SAGA_EVENT_PUBLISHER)
    private readonly sagaPublisher: IOrderSagaEventPublisher,
    private readonly configService: ConfigService,
  ) {
    this.minCardAmount =
      this.configService.get<number>('PAYMENT_MIN_CARD_AMOUNT') ??
      DEFAULT_MIN_CARD_AMOUNT;
  }

  /**
   * Handles `payment.create.requested` (AC1-AC4). Idempotent (FR3): a duplicate request for
   * an order that already has a stored payment skips re-deciding the outcome and just
   * re-publishes the stored reply, so a caller that missed the first reply can still
   * progress without a second row or a flipped outcome.
   */
  async processPayment(
    orderId: string,
    userId: string,
    orderCode: string,
    amount: number,
    paymentMethod: string,
  ): Promise<void> {
    const existing = await this.paymentRepository.findByOrderId(orderId);
    if (existing) {
      this.logger.warn(
        `Duplicate payment.create.requested for order ${orderId} — already processed, re-publishing stored outcome`,
      );
      await this.republish(existing);
      return;
    }

    if (paymentMethod !== SUPPORTED_PAYMENT_METHOD) {
      const reason = `Phương thức thanh toán không được hỗ trợ: ${paymentMethod}`;
      const payment = await this.paymentRepository.createFailed(
        orderId,
        userId,
        orderCode,
        amount,
        paymentMethod,
        reason,
      );
      await this.sagaPublisher.publishPaymentFailed(
        orderId,
        payment.failureReason ?? reason,
      );
      return;
    }

    if (amount >= this.minCardAmount) {
      const transactionCode = `TXN-${Date.now()}`;
      const payment = await this.paymentRepository.createPaid(
        orderId,
        userId,
        orderCode,
        amount,
        paymentMethod,
        transactionCode,
      );
      await this.sagaPublisher.publishPaymentCompleted(
        orderId,
        payment.id,
        payment.transactionCode ?? transactionCode,
      );
      return;
    }

    const reason = `Số tiền thanh toán dưới hạn mức tối thiểu (tối thiểu ${this.minCardAmount.toLocaleString('vi-VN')} ₫)`;
    const payment = await this.paymentRepository.createFailed(
      orderId,
      userId,
      orderCode,
      amount,
      paymentMethod,
      reason,
    );
    await this.sagaPublisher.publishPaymentFailed(
      orderId,
      payment.failureReason ?? reason,
    );
  }

  /** `GET /payments/:orderId` (FR4). Returns `null` if no payment has been processed yet. */
  async getByOrderId(orderId: string): Promise<Payment | null> {
    return this.paymentRepository.findByOrderId(orderId);
  }

  /** Re-publishes a previously stored outcome (FR3) — never re-decides it. */
  private async republish(payment: Payment): Promise<void> {
    if (payment.status === PaymentStatus.PAID) {
      await this.sagaPublisher.publishPaymentCompleted(
        payment.orderId,
        payment.id,
        payment.transactionCode ?? '',
      );
    } else {
      await this.sagaPublisher.publishPaymentFailed(
        payment.orderId,
        payment.failureReason ?? '',
      );
    }
  }
}
