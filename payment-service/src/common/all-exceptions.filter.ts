import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

const INTERNAL_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống';

/** Generic `error.code` by HTTP status (plan "Envelope contract"). */
const CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.BAD_GATEWAY]: 'EXTERNAL_SERVICE_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  [HttpStatus.GATEWAY_TIMEOUT]: 'GATEWAY_TIMEOUT',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
};

function codeForStatus(status: number): string {
  return (
    CODE_BY_STATUS[status] ??
    HttpStatus[status] ??
    (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST')
  );
}

/**
 * Turns every thrown error into `{ success: false, message, error: { code, details } }`.
 * `ValidationPipe` message arrays become `VALIDATION_FAILED` (first message in `message`,
 * full list in `details`); non-HTTP errors become 500 `INTERNAL_ERROR`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: INTERNAL_ERROR_MESSAGE,
        error: { code: 'INTERNAL_ERROR', details: null },
      });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const rawMessage: unknown =
      typeof body === 'string'
        ? body
        : ((body as { message?: unknown }).message ?? exception.message);

    if (Array.isArray(rawMessage)) {
      const messages = rawMessage.map(String);
      response.status(status).json({
        success: false,
        message: messages[0] ?? exception.message,
        error: { code: 'VALIDATION_FAILED', details: messages },
      });
      return;
    }

    response.status(status).json({
      success: false,
      message: String(rawMessage),
      error: { code: codeForStatus(status), details: null },
    });
  }
}
