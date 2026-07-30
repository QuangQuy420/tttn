import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../db/entities/payment.entity';
import { PaymentStatus } from '../db/enums/payment-status.enum';

export interface IPaymentRepository {
  /** Idempotency check (FR3): is there already a stored payment for this order? */
  findByOrderId(orderId: string): Promise<Payment | null>;
  /** Persists a successful outcome (FR1/FR2). */
  createPaid(
    orderId: string,
    userId: string,
    orderCode: string,
    amount: number,
    paymentMethod: string,
    transactionCode: string,
  ): Promise<Payment>;
  /** Persists a failed outcome (FR1/FR2), with a Vietnamese `reason`. */
  createFailed(
    orderId: string,
    userId: string,
    orderCode: string,
    amount: number,
    paymentMethod: string,
    reason: string,
  ): Promise<Payment>;
}

@Injectable()
export class TypeOrmPaymentRepository implements IPaymentRepository {
  constructor(
    @InjectRepository(Payment)
    private readonly repo: Repository<Payment>,
  ) {}

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return this.repo.findOne({ where: { orderId } });
  }

  async createPaid(
    orderId: string,
    userId: string,
    orderCode: string,
    amount: number,
    paymentMethod: string,
    transactionCode: string,
  ): Promise<Payment> {
    const payment = this.repo.create({
      orderId,
      userId,
      orderCode,
      amount,
      paymentMethod,
      status: PaymentStatus.PAID,
      transactionCode,
      failureReason: null,
    });
    return this.repo.save(payment);
  }

  async createFailed(
    orderId: string,
    userId: string,
    orderCode: string,
    amount: number,
    paymentMethod: string,
    reason: string,
  ): Promise<Payment> {
    const payment = this.repo.create({
      orderId,
      userId,
      orderCode,
      amount,
      paymentMethod,
      status: PaymentStatus.FAILED,
      transactionCode: null,
      failureReason: reason,
    });
    return this.repo.save(payment);
  }
}
