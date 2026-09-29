import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { FrameShape } from '../../db/enums/frame-shape.enum';
import { GenderTarget } from '../../db/enums/gender-target.enum';
import { ProductStatus } from '../../db/enums/product-status.enum';
import { FaceShape } from '../../db/enums/face-shape.enum';
import { MaterialType } from '../../db/enums/material-type.enum';

export const PRODUCT_SORT_OPTIONS = [
  'newest',
  'price_asc',
  'price_desc',
] as const;
export type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number];

export class ListProductsQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Legacy single-brand filter — kept for backward compatibility (prefer `brandIds`). */
  @IsOptional()
  @IsUUID()
  brandId?: string;

  /** Comma-separated brand ids (`?brandIds=a,b`); matches any of them. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : value,
  )
  @IsArray()
  @IsUUID('4', { each: true })
  brandIds?: string[];

  @IsOptional()
  @IsEnum(MaterialType)
  materialType?: MaterialType;

  /** Matches products having at least one variant of this color (case-insensitive). */
  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsEnum(FrameShape)
  frameShape?: FrameShape;

  @IsOptional()
  @IsEnum(GenderTarget)
  genderTarget?: GenderTarget;

  @IsOptional()
  @IsEnum(FaceShape)
  faceShape?: FaceShape;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  /** Admin-only escape hatch: see all statuses, not just PUBLISHED (AC1). Ignored if `status` is set. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeAllStatuses?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxPrice?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(PRODUCT_SORT_OPTIONS)
  sort: ProductSort = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
