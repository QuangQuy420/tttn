import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Not `PartialType(CreateReviewDto)`: its `@IsOptional()` also skips `null`, which would let
 * `{ "rating": null }` reach the NOT NULL column. `rating` may be omitted but never null;
 * `comment` may be null or "" to clear it.
 */
export class UpdateReviewDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}
