import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MaxLength(100)
  color: string;

  @IsString()
  @MaxLength(50)
  size: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  extraPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
