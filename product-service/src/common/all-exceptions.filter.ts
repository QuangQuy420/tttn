import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorResponse } from './api-response';

const ERROR_CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.BAD_GATEWAY]: 'EXTERNAL_SERVICE_ERROR',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  [HttpStatus.GATEWAY_TIMEOUT]: 'GATEWAY_TIMEOUT',
};

const INTERNAL_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống';

/**
 * Turns every thrown error into `{ success:false, message, error:{code, details} }`.
 * `ValidationPipe` failures (array `message`) become `VALIDATION_FAILED`; non-HTTP
 * errors become a 500 `INTERNAL_ERROR` without leaking internals.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(this.toBody(exception, status));
  }

  private toBody(exception: unknown, status: number): ApiErrorResponse {
    const code = this.codeFor(status);
    if (!(exception instanceof HttpException)) {
      return {
        success: false,
        message: INTERNAL_ERROR_MESSAGE,
        error: { code, details: null },
      };
    }

    const body = exception.getResponse();
    const message =
      typeof body === 'string' ? body : (body as { message?: unknown }).message;

    if (Array.isArray(message)) {
      return {
        success: false,
        message: String(message[0] ?? exception.message),
        error: { code: 'VALIDATION_FAILED', details: message },
      };
    }

    return {
      success: false,
      message: typeof message === 'string' ? message : exception.message,
      error: { code, details: null },
    };
  }

  private codeFor(status: number): string {
    return (
      ERROR_CODE_BY_STATUS[status] ?? HttpStatus[status] ?? 'INTERNAL_ERROR'
    );
  }
}
