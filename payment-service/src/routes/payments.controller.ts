import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PaymentsService } from '../services/payments.service';
import { PaymentResponseDto } from './dto/payment-response.dto';

/**
 * Internal/debug REST surface only (FR4) — not routed through `api-gateway`, matching this
 * service's "no direct end-user-facing API surface" note. There is no `POST /payments`:
 * checkout no longer calls payment-service synchronously, it goes through
 * `payment.create.requested` on `order-saga-events` instead (see
 * `OrderSagaEventConsumer`/`PaymentsService.processPayment`).
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(':orderId')
  async findByOrderId(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.paymentsService.getByOrderId(orderId);
    if (!payment) {
      throw new NotFoundException(
        `Không tìm thấy thanh toán cho đơn hàng ${orderId}`,
      );
    }
    return {
      id: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      orderCode: payment.orderCode,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      transactionCode: payment.transactionCode,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}
