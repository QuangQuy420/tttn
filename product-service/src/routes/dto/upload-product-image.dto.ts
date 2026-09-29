import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ImageKind } from '../../db/enums/image-kind.enum';

export class UploadProductImageDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsEnum(ImageKind, { message: 'Loại ảnh không hợp lệ' })
  kind?: ImageKind;
}
