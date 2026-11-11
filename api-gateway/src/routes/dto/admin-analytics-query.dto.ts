import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export const ANALYTICS_SOURCES = ['real', 'simulator', 'all'] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

/** The 5 funnel event types (UNLIKE is not part of the admin analytics). */
export const FUNNEL_EVENT_TYPES = [
  'VIEW',
  'TRY_ON',
  'LIKE',
  'ADD_TO_CART',
  'PURCHASE',
] as const;
export type FunnelEventType = (typeof FUNNEL_EVENT_TYPES)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `from` / `to` (inclusive, `YYYY-MM-DD`). Defaults, the 90-day limit and
 * `from <= to` are checked by the upstream service (400 with a Vietnamese
 * message passed through as-is).
 */
export class AnalyticsRangeQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'from phải có dạng YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'to phải có dạng YYYY-MM-DD' })
  to?: string;
}

/** Range + event source filter (`real` by default upstream). */
export class AnalyticsEventsQueryDto extends AnalyticsRangeQueryDto {
  @IsOptional()
  @IsIn(ANALYTICS_SOURCES, {
    message: 'source chỉ được là real, simulator hoặc all',
  })
  source?: AnalyticsSource;
}

/** Range + source + the event type to rank by and the top-N size. */
export class TopProductsQueryDto extends AnalyticsEventsQueryDto {
  @IsOptional()
  @IsIn(FUNNEL_EVENT_TYPES, {
    message:
      'eventType chỉ được là VIEW, TRY_ON, LIKE, ADD_TO_CART hoặc PURCHASE',
  })
  eventType?: FunnelEventType;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(50, { message: 'limit tối đa là 50' })
  limit?: number;
}
