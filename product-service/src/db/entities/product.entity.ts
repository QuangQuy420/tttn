import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Brand } from './brand.entity';
import { Category } from './category.entity';
import { ProductVariant } from './product-variant.entity';
import { ProductImage } from './product-image.entity';
import { FaceShape } from '../enums/face-shape.enum';
import { FrameShape } from '../enums/frame-shape.enum';
import { GenderTarget } from '../enums/gender-target.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { numericTransformer } from '../transformers/numeric.transformer';

/**
 * `ps_products` — see plan's Data model table. No deviations from the literal ERD draft;
 * used as the audit-column baseline for the other `ps_*` tables. Indexed on
 * category_id/brand_id/frame_shape/status/gender_target for AC3's filtering (T9).
 */
@Entity('ps_products')
@Index(['categoryId'])
@Index(['brandId'])
@Index(['frameShape'])
@Index(['status'])
@Index(['genderTarget'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'brand_id', type: 'uuid' })
  brandId: string;

  @ManyToOne(() => Brand, (brand) => brand.products, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'brand_id' })
  brand?: Brand;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => Category, (category) => category.products, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category?: Category;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'face_fit_note', type: 'text', nullable: true })
  faceFitNote: string | null;

  @Column({
    name: 'face_shapes',
    type: 'enum',
    enum: FaceShape,
    enumName: 'ps_face_shape_enum',
    array: true,
    default: () => "'{}'",
  })
  faceShapes: FaceShape[];

  @Column({
    name: 'frame_shape',
    type: 'enum',
    enum: FrameShape,
    enumName: 'ps_frame_shape_enum',
  })
  frameShape: FrameShape;

  @Column({
    name: 'gender_target',
    type: 'enum',
    enum: GenderTarget,
    enumName: 'ps_gender_target_enum',
  })
  genderTarget: GenderTarget;

  @Column({ type: 'varchar', length: 100, nullable: true })
  material: string | null;

  @Column({
    name: 'base_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  basePrice: number;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'ps_product_status_enum',
    default: ProductStatus.DRAFT,
  })
  status: ProductStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants?: ProductVariant[];

  @OneToMany(() => ProductImage, (image) => image.product)
  images?: ProductImage[];
}
