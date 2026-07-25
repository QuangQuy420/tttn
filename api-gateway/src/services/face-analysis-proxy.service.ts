import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import * as FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { AppConfig } from '../config/configuration';

/**
 * Forwards `/api/face-analysis/*` requests to `face-processing-service`.
 * Holds no business logic of its own — it's a thin, typed HTTP client (per
 * README: gateway owns no data, only proxies).
 *
 * Auth is verified upstream by `JwtGuard`; this service forwards the
 * already-verified `userId` downstream via `X-User-Id` so
 * `face-processing-service` can attribute/scope results without verifying
 * JWTs itself (Q4).
 */
@Injectable()
export class FaceAnalysisProxyService {
  private readonly logger = new Logger(FaceAnalysisProxyService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<AppConfig>('app')!.faceProcessingServiceUrl;
  }

  async analyzeFace(file: Express.Multer.File, userId: string): Promise<unknown> {
    const path = '/analyze';
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, form, {
          headers: { ...form.getHeaders(), 'X-User-Id': userId },
        }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async getHistory(userId: string): Promise<unknown> {
    const path = '/analyses';

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${path}`, {
          headers: { 'X-User-Id': userId },
        }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async deleteHistoryItem(id: string, userId: string): Promise<unknown> {
    const path = `/analyses/${id}`;

    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${path}`, {
          headers: { 'X-User-Id': userId },
        }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  /**
   * Maps a downstream failure to a clear gateway-side error instead of
   * letting it surface as an unhandled 500:
   * - downstream responded (e.g. 400) -> passthrough its status/body.
   * - downstream timed out -> 504 Gateway Timeout.
   * - downstream unreachable (connection refused/reset/DNS) -> 503.
   */
  private toGatewayError(error: AxiosError, path: string): HttpException {
    if (error.response) {
      return new HttpException(
        this.normalizeErrorBody(error.response.data) ?? error.message,
        error.response.status,
      );
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      this.logger.error(`face-processing-service timed out on ${path}: ${error.message}`);
      return new HttpException(
        'face-processing-service không phản hồi kịp thời',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    this.logger.error(`face-processing-service unreachable on ${path}: ${error.message}`);
    return new HttpException(
      'Không thể kết nối tới face-processing-service',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /**
   * `face-processing-service` (FastAPI) returns errors as `{"detail": "..."}` by default —
   * unlike `product-service` (Nest), whose exception filter already shapes errors as
   * `{message: "..."}`, which is the key `web`'s `apiFetch` reads (see
   * `web/src/lib/api/client.ts`). Without this, a real domain message like "No face detected"
   * would silently get lost and `web` would fall back to a generic status-text error.
   */
  private normalizeErrorBody(data: unknown): unknown {
    if (
      data &&
      typeof data === 'object' &&
      'detail' in data &&
      !('message' in data)
    ) {
      return { ...data, message: (data as { detail: unknown }).detail };
    }
    return data;
  }
}
