import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentStatus } from '../enums/payment-status.enum';
import { numericTransformer } from '../transformers/numeric.transformer';

/**
 * `payments` — one row per order the checkout saga asked payment-service to process
 * (`payment.create.requested`). `order_id` is unique: FR3's idempotency check
 * (`IPaymentRepository.findByOrderId`) relies on at most one row per order existing, so a
 * redelivered request re-publishes the stored outcome instead of writing a second row. No FK
 * to `order-service`'s own tables — database-per-service, no cross-service FKs (root
 * CLAUDE.md).
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'order_code', type: 'varchar', length: 100 })
  orderCode: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  amount: number;

  @Column({ name: 'payment_method', type: 'varchar', length: 50 })
  paymentMethod: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payments_status_enum',
  })
  status: PaymentStatus;

  @Column({
    name: 'transaction_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  transactionCode: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
