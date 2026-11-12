import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { numericTransformer } from '../transformers/numeric.transformer';

/**
 * `ps_product_variants` — see plan's Data model table.
 * Deviations from the literal ERD draft (Q11):
 *  - Adds `updated_at` and `deleted_at` (soft-delete), matching `ps_products` — Order
 *    Service FKs to a variant `id`, so a hard delete of a referenced variant would break
 *    order history.
 *  - Adds a unique index on `(product_id, color, size)` to prevent duplicate variants —
 *    partial (`deleted_at IS NULL`) so a soft-deleted variant can be re-created.
 */
@Entity('ps_product_variants')
@Index(
  'UQ_ps_product_variants_product_color_size_active',
  ['productId', 'color', 'size'],
  { unique: true, where: '"deleted_at" IS NULL' },
)
@Check('chk_ps_product_variants_quantity_non_negative', '"quantity" >= 0')
@Check(
  'chk_ps_product_variants_reserved_quantity_non_negative',
  '"reserved_quantity" >= 0',
)
@Check(
  'chk_ps_product_variants_reserved_quantity_within_quantity',
  '"reserved_quantity" <= "quantity"',
)
export class ProductVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ type: 'varchar', length: 100 })
  color: string;

  @Column({ type: 'varchar', length: 50 })
  size: string;

  @Column({
    name: 'extra_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  extraPrice: number;

  @Column({ name: 'sku_variant', type: 'varchar', length: 100, unique: true })
  skuVariant: string;

  @Column({ name: 'color_hex', type: 'varchar', length: 7, nullable: true })
  colorHex: string | null;

  @Column({ type: 'int', default: 0 })
  quantity: number;

  @Column({ name: 'reserved_quantity', type: 'int', default: 0 })
  reservedQuantity: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
