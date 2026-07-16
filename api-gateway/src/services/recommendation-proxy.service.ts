import { HttpService } from '@nestjs/axios';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AppConfig } from '../config/configuration';

/**
 * Forwards `/api/recommendations` requests to `recommendation-service`.
 * Holds no business logic of its own — it's a thin, typed HTTP client (per
 * README: gateway owns no data, only proxies).
 *
 * Stateless proxy: no auth guard here, matching `GET /products`'
 * unauthenticated precedent (Q2) — faceShape in, ranked products out, no
 * per-user data involved.
 */
@Injectable()
export class RecommendationProxyService {
  private readonly logger = new Logger(RecommendationProxyService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<AppConfig>('app')!.recommendationServiceUrl;
  }

  async recommend(body: Record<string, unknown>): Promise<unknown> {
    const path = '/recommend';

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, body),
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
      this.logger.error(`recommendation-service timed out on ${path}: ${error.message}`);
      return new HttpException(
        'recommendation-service không phản hồi kịp thời',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    this.logger.error(`recommendation-service unreachable on ${path}: ${error.message}`);
    return new HttpException(
      'Không thể kết nối tới recommendation-service',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /**
   * `recommendation-service` (FastAPI) returns errors as `{"detail": "..."}`
   * by default if it raises `HTTPException(detail=...)` — unlike
   * `product-service` (Nest), whose exception filter already shapes errors
   * as `{message: "..."}`, which is the key `web`'s `apiFetch` reads (see
   * `web/src/lib/api/client.ts`). Without this, a real domain message would
   * silently get lost and `web` would fall back to a generic status-text
   * error.
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
