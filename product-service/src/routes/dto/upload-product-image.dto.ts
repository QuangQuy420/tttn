import { IsIn } from 'class-validator';

export class UploadProductImageDto {
  @IsIn(['main', 'angle1', 'angle2', 'angle3'])
  slot: 'main' | 'angle1' | 'angle2' | 'angle3';
}
