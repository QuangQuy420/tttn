import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

/**
 * `?includeAllStatuses=true|false` — opt-in to see non-PUBLISHED products (admin reads; the
 * gateway forwards it only for callers holding `product:manage`).
 *
 * Reads the RAW query string: the global `ValidationPipe` runs with
 * `enableImplicitConversion`, which turns any non-empty string (including `"false"`) into
 * `true` before a `({ value })` transform would see it. Anything other than `"true"` /
 * `"false"` is passed through unchanged so `@IsBoolean()` rejects it with a 400.
 */
export function IncludeAllStatusesQuery(): PropertyDecorator {
  return applyDecorators(
    IsOptional(),
    Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
      obj[key] === 'true' ? true : obj[key] === 'false' ? false : obj[key],
    ),
    IsBoolean(),
  );
}

/** Query of the public product detail reads (`/products/:id`, `/products/slug/:slug`) and the review summary. */
export class IncludeAllStatusesQueryDto {
  @IncludeAllStatusesQuery()
  includeAllStatuses?: boolean;
}

/** Query of the public review list (`/products/:id/reviews`). */
export class ListProductReviewsQueryDto extends PaginationQueryDto {
  @IncludeAllStatusesQuery()
  includeAllStatuses?: boolean;
}
