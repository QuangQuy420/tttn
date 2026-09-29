import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { ReviewStatus } from '../enums/review-status.enum';

/**
 * `ps_reviews` — one review per (product, user), written only by a verified buyer (checked
 * against order-service at create time). `reviewer_name` is a snapshot of the JWT username
 * (user-service is not touched). Only PUBLISHED rows count towards the product's
 * `avg_rating`/`review_count` aggregate.
 */
@Entity('ps_reviews')
@Unique('uq_ps_reviews_product_user', ['productId', 'userId'])
@Check('chk_ps_reviews_rating_range', '"rating" >= 1 AND "rating" <= 5')
@Index(['productId', 'status', 'createdAt'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'reviewer_name', type: 'varchar', length: 100 })
  reviewerName: string;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'is_verified_purchase', type: 'boolean', default: false })
  isVerifiedPurchase: boolean;

  @Column({
    type: 'enum',
    enum: ReviewStatus,
    enumName: 'ps_review_status_enum',
    default: ReviewStatus.PUBLISHED,
  })
  status: ReviewStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
