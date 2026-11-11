import {
  applyDecorators,
  BadRequestException,
  CallHandler,
  ExecutionContext,
  mixin,
  NestInterceptor,
  ParseFilePipe,
  PayloadTooLargeException,
  Type,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable, catchError, throwError } from 'rxjs';

const MB = 1024 * 1024;

/**
 * Single-file upload on the multipart field `file`, capped at `maxMb`.
 * multer stops reading at the limit and Nest maps its error to
 * `PayloadTooLargeException` (413 `PAYLOAD_TOO_LARGE`); the outer
 * interceptor only swaps multer's English message for a Vietnamese one.
 */
export function SingleFileUpload(maxMb: number): MethodDecorator {
  return applyDecorators(
    UseInterceptors(
      tooLargeMessageInterceptor(`Tệp vượt quá dung lượng tối đa ${maxMb} MB`),
      FileInterceptor('file', { limits: { fileSize: maxMb * MB } }),
    ),
  );
}

/** `@UploadedFile(RequiredFilePipe)` → 400 when the request has no `file` part. */
export const RequiredFilePipe = new ParseFilePipe({
  exceptionFactory: () =>
    new BadRequestException('Thiếu tệp tải lên (trường "file")'),
});

function tooLargeMessageInterceptor(message: string): Type<NestInterceptor> {
  class TooLargeMessageInterceptor implements NestInterceptor {
    intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
      return next.handle().pipe(
        catchError((error: unknown) =>
          throwError(() =>
            error instanceof PayloadTooLargeException
              ? new PayloadTooLargeException(message)
              : error,
          ),
        ),
      );
    }
  }
  return mixin(TooLargeMessageInterceptor);
}
