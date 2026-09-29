import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';
import { ImageKind } from '../enums/image-kind.enum';

/**
 * `ps_product_images` — see plan's Data model table.
 * Deviation from the literal ERD draft (Q11): adds `created_at`/`updated_at` (had none).
 *
 * `variant_id` is an independent FK from `product_id` — the DB schema does NOT enforce
 * that the variant belongs to the same product; that is enforced at the application
 * layer (see `ProductImagesService`), per Q11.
 */
@Entity('ps_product_images')
@Index('UQ_ps_product_images_try_on', ['productId'], {
  unique: true,
  where: `"kind" = 'TRY_ON'`,
})
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariant | null;

  @Column({ name: 'image_url', type: 'varchar', length: 512 })
  imageUrl: string;

  @Column({ name: 'is_thumbnail', type: 'boolean', default: false })
  isThumbnail: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /**
   * `TRY_ON` = transparent PNG for the virtual try-on overlay. At most one per product —
   * enforced by the partial unique index `UQ_ps_product_images_try_on`; uploads demote the
   * previous TRY_ON image first (`ProductImagesService.uploadAndAttach`).
   */
  @Column({
    type: 'enum',
    enum: ImageKind,
    enumName: 'ps_image_kind_enum',
    default: ImageKind.GALLERY,
  })
  kind: ImageKind;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
