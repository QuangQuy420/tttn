import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Product } from './product.entity';
import { FaceShape } from '../enums/face-shape.enum';

/**
 * `ps_product_face_shapes` — junction table (composite PK), which face shapes a given
 * product suits (FR7). Independent of `ps_face_shape_styles` (the global face-shape →
 * frame-shape recommendation rule table) — this is per-product tagging, modeled on
 * `ProductTag`'s composite-PK shape. No audit columns, same as `ps_product_tags`.
 */
@Entity('ps_product_face_shapes')
export class ProductFaceShape {
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  @PrimaryColumn({
    name: 'face_shape',
    type: 'enum',
    enum: FaceShape,
    enumName: 'ps_face_shape_enum',
  })
  faceShape: FaceShape;
}
