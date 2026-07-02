import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProductVariant } from './product-variant.entity';

/**
 * `ps_inventory` — schema only this sprint (Q10); no repository/service/controller and
 * no seed data yet.
 * Deviations from the literal ERD draft (Q11): adds `created_at`; adds a unique
 * constraint on `(variant_id, warehouse_code)` to prevent duplicate stock rows.
 */
@Entity('ps_inventory')
@Unique('uq_ps_inventory_variant_warehouse', ['variantId', 'warehouseCode'])
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariant;

  @Column({ name: 'warehouse_code', type: 'varchar', length: 100 })
  warehouseCode: string;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'reserved_quantity', type: 'int', default: 0 })
  reservedQuantity: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
