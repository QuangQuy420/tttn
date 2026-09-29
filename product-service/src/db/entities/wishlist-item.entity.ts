import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';

/**
 * `ps_wishlist_items` — one row per (user, liked product). `user_id` is a plain UUID because
 * users belong to user-service's separate database; the unique (user_id, product_id) makes a
 * repeated like a no-op (`INSERT … ON CONFLICT DO NOTHING`).
 */
@Entity('ps_wishlist_items')
@Unique('uq_ps_wishlist_items_user_product', ['userId', 'productId'])
@Index(['userId', 'createdAt'])
export class WishlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
