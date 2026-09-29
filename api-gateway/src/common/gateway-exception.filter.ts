import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ApiErrorResponse {
  success: false;
  message: string;
  error: { code: string; details: unknown };
}

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
 * Error side of the shared envelope `{ success:false, message, error:{code, details} }`.
 * Upstream services already send this envelope, and the proxies rethrow it
 * as the `HttpException` response — that body is passed through unchanged.
 * Only errors the gateway creates itself (JWT 401, permission 403, 503/504
 * downstream failures, unknown route 404, `ValidationPipe` 400) get an
 * envelope built here. Success bodies are never wrapped (backends do it).
 */
@Catch()
export class GatewayExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GatewayExceptionFilter.name);

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

  private toBody(exception: unknown, status: number): unknown {
    const code = this.codeFor(status);
    if (!(exception instanceof HttpException)) {
      return this.envelope(INTERNAL_ERROR_MESSAGE, code, null);
    }

    const body = exception.getResponse();
    if (this.isErrorEnvelope(body)) {
      return body;
    }

    const message =
      typeof body === 'string' ? body : (body as { message?: unknown }).message;

    if (Array.isArray(message)) {
      return this.envelope(
        String(message[0] ?? exception.message),
        'VALIDATION_FAILED',
        message,
      );
    }

    return this.envelope(
      typeof message === 'string' ? message : exception.message,
      code,
      null,
    );
  }

  private isErrorEnvelope(body: unknown): boolean {
    return (
      typeof body === 'object' &&
      body !== null &&
      (body as { success?: unknown }).success === false
    );
  }

  private envelope(
    message: string,
    code: string,
    details: unknown,
  ): ApiErrorResponse {
    return { success: false, message, error: { code, details } };
  }

  private codeFor(status: number): string {
    return (
      ERROR_CODE_BY_STATUS[status] ?? HttpStatus[status] ?? 'INTERNAL_ERROR'
    );
  }
}
