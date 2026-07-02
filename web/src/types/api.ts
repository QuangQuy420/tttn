// Mirrors product-service's PaginatedResponseDto (src/routes/dto/paginated-response.dto.ts) —
// a flat envelope, not a nested data/meta shape.
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
