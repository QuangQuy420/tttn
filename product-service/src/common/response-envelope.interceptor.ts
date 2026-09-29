import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { ApiSuccessResponse, Paginated, SUCCESS_MESSAGE } from './api-response';
import { SKIP_ENVELOPE_KEY } from './skip-envelope.decorator';

/**
 * Wraps every HTTP success body into `{ success, message, data }` (+ `meta` for a
 * `Paginated` result). `undefined` bodies (204) and `@SkipEnvelope()` routes pass through.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (context.getType() !== 'http' || skip) {
      return next.handle();
    }

    return next.handle().pipe(map((body: unknown) => this.wrap(body)));
  }

  private wrap(body: unknown): ApiSuccessResponse<unknown> | undefined {
    if (body === undefined) {
      return undefined;
    }
    if (body instanceof Paginated) {
      return {
        success: true,
        message: SUCCESS_MESSAGE,
        data: body.items,
        meta: body.meta,
      };
    }
    return { success: true, message: SUCCESS_MESSAGE, data: body };
  }
}
