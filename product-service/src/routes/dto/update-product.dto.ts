import {
  IntersectionType,
  OmitType,
  PartialType,
  PickType,
} from '@nestjs/mapped-types';
import { ArrayUnique, IsArray, IsEnum, ValidateIf } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { ProductStatus } from '../../db/enums/product-status.enum';
import { FaceShape } from '../../db/enums/face-shape.enum';

/** NOT NULL columns that are required on create: may be omitted on update, never null. */
const REQUIRED_FIELDS = [
  'name',
  'categoryId',
  'brandId',
  'frameShape',
  'genderTarget',
  'basePrice',
] as const;

/**
 * Not a plain `PartialType(CreateProductDto)`: its `@IsOptional()` also skips `null`, which
 * would let `{ "name": null }` reach a NOT NULL column (500). NOT NULL fields may be omitted
 * but never null; nullable fields (`material`, `materialType`, `description`, `faceFitNote`,
 * measurements) keep accepting `null` because the admin form clears them that way.
 */
export class UpdateProductDto extends IntersectionType(
  PartialType(PickType(CreateProductDto, REQUIRED_FIELDS), {
    skipNullProperties: false,
  }),
  PartialType(
    OmitType(CreateProductDto, [
      ...REQUIRED_FIELDS,
      'status',
      'faceShapes',
    ] as const),
  ),
) {
  // Optional on create too (so `@IsOptional()` there), but NOT NULL — declared here instead.
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsEnum(FaceShape, { each: true })
  faceShapes?: FaceShape[];
}
