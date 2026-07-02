import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

/**
 * `ps_ratings` — schema only this sprint (Q10); no repository/service/controller and no
 * seed data yet.
 * Deviations from the literal ERD draft (Q11):
 *  - Adds `updated_at` (a user editing their review).
 *  - Adds a unique constraint on `(product_id, user_id)` to prevent duplicate ratings.
 *  - Adds a `CHECK (score BETWEEN 1 AND 5)` — the ERD draft has no range check.
 *
 * `user_id` is a plain `uuid` with NO foreign key (Q9 — `us_users` lives in a different
 * database under database-per-service; ownership is checked at the app layer via the
 * JWT/gateway-forwarded identity once auth exists).
 */
@Entity('ps_ratings')
@Unique('uq_ps_ratings_product_user', ['productId', 'userId'])
@Check('chk_ps_ratings_score_range', '"score" >= 1 AND "score" <= 5')
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
