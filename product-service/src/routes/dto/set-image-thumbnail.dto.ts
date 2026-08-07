import { IsBoolean } from 'class-validator';

export class SetImageThumbnailDto {
  @IsBoolean()
  isThumbnail: boolean;
}
