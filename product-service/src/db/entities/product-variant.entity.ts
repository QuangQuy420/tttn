import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
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
 *  - Adds a unique constraint on `(product_id, color, size)` to prevent duplicate variants.
 */
@Entity('ps_product_variants')
@Unique('uq_ps_product_variants_product_color_size', [
  'productId',
  'color',
  'size',
])
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
