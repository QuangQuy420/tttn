// The unified response envelope every backend service sends (api-gateway passes it through
// unchanged). `meta` is only present on list responses, where `data` is always an array.
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PageMeta;
}

// Error body: `error.code` is a stable UPPER_SNAKE code (e.g. NOT_FOUND, CART_CHANGED),
// `message` is the Vietnamese text shown to the user.
export interface ApiErrorBody {
  success: false;
  message: string;
  error?: {
    code: string;
    details: unknown;
  };
}

// What a list call resolves to — the envelope's `data` array plus its `meta`.
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

// Query params every list endpoint accepts (`page` is 1-based, `limit` is 1..100).
export interface PageParams {
  page?: number;
  limit?: number;
}
