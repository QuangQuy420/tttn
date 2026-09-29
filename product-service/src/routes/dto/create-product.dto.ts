import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FrameShape } from '../../db/enums/frame-shape.enum';
import { GenderTarget } from '../../db/enums/gender-target.enum';
import { ProductStatus } from '../../db/enums/product-status.enum';
import { FaceShape } from '../../db/enums/face-shape.enum';
import { MaterialType } from '../../db/enums/material-type.enum';

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

  @IsOptional()
  @IsEnum(MaterialType, { message: 'Loại chất liệu không hợp lệ' })
  materialType?: MaterialType | null;

  /** Frame measurements in mm — integer ranges per the catalog-enrichment plan. */
  @IsOptional()
  @IsInt({ message: 'Chiều rộng tròng phải là số nguyên (mm)' })
  @Min(40, { message: 'Chiều rộng tròng phải từ 40 đến 65 mm' })
  @Max(65, { message: 'Chiều rộng tròng phải từ 40 đến 65 mm' })
  lensWidthMm?: number | null;

  @IsOptional()
  @IsInt({ message: 'Chiều rộng cầu mũi phải là số nguyên (mm)' })
  @Min(12, { message: 'Chiều rộng cầu mũi phải từ 12 đến 26 mm' })
  @Max(26, { message: 'Chiều rộng cầu mũi phải từ 12 đến 26 mm' })
  bridgeWidthMm?: number | null;

  @IsOptional()
  @IsInt({ message: 'Chiều dài càng kính phải là số nguyên (mm)' })
  @Min(120, { message: 'Chiều dài càng kính phải từ 120 đến 160 mm' })
  @Max(160, { message: 'Chiều dài càng kính phải từ 120 đến 160 mm' })
  templeLengthMm?: number | null;

  @IsOptional()
  @IsInt({ message: 'Tổng chiều ngang gọng phải là số nguyên (mm)' })
  @Min(110, { message: 'Tổng chiều ngang gọng phải từ 110 đến 160 mm' })
  @Max(160, { message: 'Tổng chiều ngang gọng phải từ 110 đến 160 mm' })
  frameWidthMm?: number | null;

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
