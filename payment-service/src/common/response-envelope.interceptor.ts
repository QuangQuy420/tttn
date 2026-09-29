import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { HealthController } from '../routes/health.controller';

export const SUCCESS_MESSAGE = 'Thành công';

/** Page metadata emitted next to `data` on list responses. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** A service-level paginated result — unwrapped into `data` + `meta`. */
interface PaginatedResult<T> {
  items: T[];
  meta: PageMeta;
}

function isPaginated(value: unknown): value is PaginatedResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as PaginatedResult<unknown>).items) &&
    typeof (value as PaginatedResult<unknown>).meta === 'object' &&
    (value as PaginatedResult<unknown>).meta !== null
  );
}

/**
 * Wraps every controller return into `{ success: true, message, data }` (plus `meta` for
 * paginated results). `undefined` bodies (204) and the `HealthController` stay unwrapped.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getClass() === HealthController) {
      return next.handle();
    }
    return next.handle().pipe(
      map((value: unknown) => {
        if (value === undefined) {
          return value;
        }
        if (isPaginated(value)) {
          return {
            success: true,
            message: SUCCESS_MESSAGE,
            data: value.items,
            meta: value.meta,
          };
        }
        return { success: true, message: SUCCESS_MESSAGE, data: value };
      }),
    );
  }
}
