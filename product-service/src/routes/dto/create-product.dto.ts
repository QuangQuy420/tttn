import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { FrameShape } from '../../db/enums/frame-shape.enum';
import { GenderTarget } from '../../db/enums/gender-target.enum';
import { ProductStatus } from '../../db/enums/product-status.enum';
import { FaceShape } from '../../db/enums/face-shape.enum';

export class CreateProductDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsUUID()
  categoryId: string;

  @IsUUID()
  brandId: string;

  @IsEnum(FrameShape)
  frameShape: FrameShape;

  @IsEnum(GenderTarget)
  genderTarget: GenderTarget;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  material?: string | null;

  @IsNumber()
  @IsPositive()
  basePrice: number;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  faceFitNote?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(FaceShape, { each: true })
  faceShapes?: FaceShape[];

  /** Optional — service defaults to PUBLISHED on create if omitted (not the entity's DRAFT default). */
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
