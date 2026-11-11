import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { MAX_PRICE } from './create-product.dto';

/** Upper bound of an admin-entered variant stock. */
export const MAX_STOCK = 1_000_000;

export class CreateVariantDto {
  @IsString()
  @MaxLength(100)
  color: string;

  @Matches(/^#[0-9A-Fa-f]{6}$/)
  colorHex: string;

  @IsString()
  @MaxLength(50)
  size: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE, {
    message: 'Giá cộng thêm không được vượt quá 99.999.999,99',
  })
  extraPrice?: number;

  /** Available stock (what the shop can still sell), not counting held reservations. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK, { message: 'Tồn kho không được vượt quá 1.000.000' })
  stock?: number;
}
