/** Default `message` of every success envelope. */
export const SUCCESS_MESSAGE = 'Thành công';

/** Pagination block of a list response — `page` is 1-based. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  /** Present only on list responses. */
  meta?: PageMeta;
}

export interface ApiErrorBody {
  code: string;
  details: unknown;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * A page of `items` returned by a service. `ResponseEnvelopeInterceptor` recognises it
 * (via `instanceof`) and emits `data = items` plus `meta`.
 */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly meta: PageMeta,
  ) {}
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return new Paginated(items, {
    page,
    limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  });
}
