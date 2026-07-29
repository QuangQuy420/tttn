import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StockReservationStatus } from '../enums/stock-reservation-status.enum';

/**
 * `ps_stock_reservations` — the checkout saga's idempotency guard (NFR2). One row per
 * (order, variant) records whether stock is currently held for that order, so a
 * duplicate `stock.reserve.requested`/`stock.release.requested` message (RabbitMQ's
 * at-least-once delivery) becomes a safe no-op instead of double reserving/releasing.
 * No FK to `ps_product_variants` — this table only needs to answer "is there a RESERVED
 * row for this order id", not join back to variant details.
 */
@Entity('ps_stock_reservations')
@Index(['orderId'])
export class StockReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    type: 'enum',
    enum: StockReservationStatus,
    enumName: 'ps_stock_reservation_status_enum',
  })
  status: StockReservationStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
