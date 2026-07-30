import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { IPaymentRepository } from '../repositories/payment.repository';
import { IOrderSagaEventPublisher } from '../repositories/order-saga-event-publisher.repository';
import { Payment } from '../db/entities/payment.entity';
import { PaymentStatus } from '../db/enums/payment-status.enum';

// Matches the plan's Open Question Q1 default — `PAYMENT_MIN_CARD_AMOUNT` env var is left
// unset in these tests (see `configService.get` mock below), so `PaymentsService` falls back
// to this same constant.
const DEFAULT_MIN_CARD_AMOUNT = 1_000_000;

function buildPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-id-1',
    orderId: 'order-1',
    userId: 'user-1',
    orderCode: 'ORD-1',
    amount: 1_500_000,
    paymentMethod: 'CARD',
    status: PaymentStatus.PAID,
    transactionCode: 'TXN-1',
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PaymentsService', () => {
  let paymentRepository: jest.Mocked<IPaymentRepository>;
  let sagaPublisher: jest.Mocked<IOrderSagaEventPublisher>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let service: PaymentsService;

  beforeEach(() => {
    paymentRepository = {
      findByOrderId: jest.fn().mockResolvedValue(null),
      createPaid: jest.fn(),
      createFailed: jest.fn(),
    };
    sagaPublisher = {
      publishPaymentCompleted: jest.fn().mockResolvedValue(undefined),
      publishPaymentFailed: jest.fn().mockResolvedValue(undefined),
    };
    // No `PAYMENT_MIN_CARD_AMOUNT` override — PaymentsService's constructor falls back to
    // its own DEFAULT_MIN_CARD_AMOUNT (1,000,000), which these tests assert against.
    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    service = new PaymentsService(
      paymentRepository,
      sagaPublisher,
      configService as unknown as ConfigService,
    );
  });

  it('pays a CARD request at/above the minimum, persists PAID, and publishes payment.completed (AC1)', async () => {
    const stored = buildPayment({
      id: 'payment-1',
      orderId: 'order-1',
      status: PaymentStatus.PAID,
      transactionCode: 'TXN-999',
    });
    paymentRepository.createPaid.mockResolvedValue(stored);

    await service.processPayment(
      'order-1',
      'user-1',
      'ORD-1',
      1_500_000,
      'CARD',
    );

    expect(paymentRepository.createPaid).toHaveBeenCalledWith(
      'order-1',
      'user-1',
      'ORD-1',
      1_500_000,
      'CARD',
      expect.stringMatching(/^TXN-/),
    );
    expect(paymentRepository.createFailed).not.toHaveBeenCalled();
    expect(sagaPublisher.publishPaymentCompleted).toHaveBeenCalledWith(
      'order-1',
      'payment-1',
      'TXN-999',
    );
    expect(sagaPublisher.publishPaymentFailed).not.toHaveBeenCalled();
  });

  it('fails a CARD request below the minimum with a Vietnamese reason naming the minimum, persists FAILED (AC2)', async () => {
    const failureReason = `Số tiền thanh toán dưới hạn mức tối thiểu (tối thiểu ${DEFAULT_MIN_CARD_AMOUNT.toLocaleString('vi-VN')} ₫)`;
    const stored = buildPayment({
      id: 'payment-2',
      orderId: 'order-2',
      status: PaymentStatus.FAILED,
      transactionCode: null,
      failureReason,
    });
    paymentRepository.createFailed.mockResolvedValue(stored);

    await service.processPayment('order-2', 'user-1', 'ORD-2', 500_000, 'CARD');

    expect(paymentRepository.createFailed).toHaveBeenCalledWith(
      'order-2',
      'user-1',
      'ORD-2',
      500_000,
      'CARD',
      expect.stringContaining('1.000.000'),
    );
    expect(paymentRepository.createPaid).not.toHaveBeenCalled();
    expect(sagaPublisher.publishPaymentFailed).toHaveBeenCalledWith(
      'order-2',
      failureReason,
    );
    expect(sagaPublisher.publishPaymentCompleted).not.toHaveBeenCalled();
  });

  it('fails a non-CARD payment method with a Vietnamese reason naming the unsupported method (AC3)', async () => {
    const failureReason = 'Phương thức thanh toán không được hỗ trợ: COD';
    const stored = buildPayment({
      id: 'payment-3',
      orderId: 'order-3',
      status: PaymentStatus.FAILED,
      transactionCode: null,
      failureReason,
    });
    paymentRepository.createFailed.mockResolvedValue(stored);

    await service.processPayment(
      'order-3',
      'user-1',
      'ORD-3',
      2_000_000,
      'COD',
    );

    expect(paymentRepository.createFailed).toHaveBeenCalledWith(
      'order-3',
      'user-1',
      'ORD-3',
      2_000_000,
      'COD',
      expect.stringContaining('COD'),
    );
    expect(paymentRepository.createPaid).not.toHaveBeenCalled();
    expect(sagaPublisher.publishPaymentFailed).toHaveBeenCalledWith(
      'order-3',
      failureReason,
    );
    expect(sagaPublisher.publishPaymentCompleted).not.toHaveBeenCalled();
  });

  it('does not re-decide or re-persist a duplicate request for an already-PAID order, just re-publishes (AC4)', async () => {
    const stored = buildPayment({
      id: 'payment-4',
      orderId: 'order-4',
      status: PaymentStatus.PAID,
      transactionCode: 'TXN-4',
    });
    paymentRepository.findByOrderId.mockResolvedValue(stored);

    await service.processPayment(
      'order-4',
      'user-1',
      'ORD-4',
      1_500_000,
      'CARD',
    );

    expect(paymentRepository.createPaid).not.toHaveBeenCalled();
    expect(paymentRepository.createFailed).not.toHaveBeenCalled();
    expect(sagaPublisher.publishPaymentCompleted).toHaveBeenCalledWith(
      'order-4',
      'payment-4',
      'TXN-4',
    );
    expect(sagaPublisher.publishPaymentFailed).not.toHaveBeenCalled();
  });

  it('does not re-decide or re-persist a duplicate request for an already-FAILED order, just re-publishes (AC4)', async () => {
    const failureReason = `Số tiền thanh toán dưới hạn mức tối thiểu (tối thiểu ${DEFAULT_MIN_CARD_AMOUNT.toLocaleString('vi-VN')} ₫)`;
    const stored = buildPayment({
      id: 'payment-5',
      orderId: 'order-5',
      status: PaymentStatus.FAILED,
      transactionCode: null,
      failureReason,
    });
    paymentRepository.findByOrderId.mockResolvedValue(stored);

    await service.processPayment('order-5', 'user-1', 'ORD-5', 500_000, 'CARD');

    expect(paymentRepository.createPaid).not.toHaveBeenCalled();
    expect(paymentRepository.createFailed).not.toHaveBeenCalled();
    expect(sagaPublisher.publishPaymentFailed).toHaveBeenCalledWith(
      'order-5',
      failureReason,
    );
    expect(sagaPublisher.publishPaymentCompleted).not.toHaveBeenCalled();
  });
});
