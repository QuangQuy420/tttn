import { IsOptional, IsUUID } from 'class-validator';

export class UploadProductImageDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;
}
