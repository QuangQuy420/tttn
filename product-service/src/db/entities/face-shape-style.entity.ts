import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { FaceShape } from '../enums/face-shape.enum';
import { FrameShape } from '../enums/frame-shape.enum';

/**
 * `ps_face_shape_styles` — schema only this sprint (Q10); really Sprint 3/
 * recommendation data even though it's prefixed `ps_`. No repository/service/
 * controller and no seed data yet.
 * Deviations from the literal ERD draft (Q11): adds `created_at`/`updated_at`; adds a
 * unique constraint on `(face_shape, recommended_frame_shape)`.
 *
 * `face_shape` uses the FaceShape taxonomy, `recommended_frame_shape` uses the
 * FrameShape taxonomy — these are two different enums, not interchangeable.
 */
@Entity('ps_face_shape_styles')
@Unique('uq_ps_face_shape_styles_shape_frame', [
  'faceShape',
  'recommendedFrameShape',
])
export class FaceShapeStyle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'face_shape',
    type: 'enum',
    enum: FaceShape,
    enumName: 'ps_face_shape_enum',
  })
  faceShape: FaceShape;

  @Column({
    name: 'recommended_frame_shape',
    type: 'enum',
    enum: FrameShape,
    enumName: 'ps_frame_shape_enum',
  })
  recommendedFrameShape: FrameShape;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
