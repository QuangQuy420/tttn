import {
  IntersectionType,
  OmitType,
  PartialType,
  PickType,
} from '@nestjs/mapped-types';
import { IsInt, IsNumber, Max, Min, ValidateIf } from 'class-validator';
import { CreateVariantDto, MAX_STOCK } from './create-variant.dto';
import { MAX_PRICE } from './create-product.dto';

/** NOT NULL columns that are required on create: may be omitted on update, never null. */
const REQUIRED_FIELDS = ['color', 'size'] as const;

/**
 * Same reason as `UpdateProductDto`: NOT NULL fields may be omitted but never null;
 * `colorHex` (nullable) keeps accepting `null`.
 */
export class UpdateVariantDto extends IntersectionType(
  PartialType(PickType(CreateVariantDto, REQUIRED_FIELDS), {
    skipNullProperties: false,
  }),
  PartialType(
    OmitType(CreateVariantDto, [
      ...REQUIRED_FIELDS,
      'extraPrice',
      'stock',
    ] as const),
  ),
) {
  // Optional on create too (so `@IsOptional()` there), but NOT NULL — declared here instead.
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE, {
    message: 'Giá cộng thêm không được vượt quá 99.999.999,99',
  })
  extraPrice?: number;

  /** New *available* stock — the server keeps held reservations on top (AC19). */
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK, { message: 'Tồn kho không được vượt quá 1.000.000' })
  stock?: number;
}
