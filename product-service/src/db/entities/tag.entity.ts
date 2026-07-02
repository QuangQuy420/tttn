import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * `ps_tags` — schema only this sprint (Q10); no repository/service/controller and no
 * seed data yet.
 * Deviation from the literal ERD draft (Q11): adds `created_at` (low priority — small
 * lookup table, but kept consistent with the rest of the schema).
 */
@Entity('ps_tags')
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
