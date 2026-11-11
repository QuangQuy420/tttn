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

const FACE_PROCESSING_SERVICE = 'face-processing-service';
const RECOMMENDATION_SERVICE = 'recommendation-service';

/**
 * Forwards `/api/admin/ai/*` and `/api/admin/analytics/*` requests to the
 * `/admin/*` routes of `face-processing-service` and
 * `recommendation-service`. Those routes are internal (no JWT), so every
 * call carries `X-Internal-Key`; the admin permission check happens here at
 * the gateway. Holds no business logic — responses (and upstream errors,
 * e.g. the 400 for an invalid date range) are passed through as-is.
 */
@Injectable()
export class AdminAnalyticsProxyService {
  private readonly logger = new Logger(AdminAnalyticsProxyService.name);
  private readonly faceProcessingServiceUrl: string;
  private readonly recommendationServiceUrl: string;
  private readonly internalApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const app = this.configService.get<AppConfig>('app')!;
    this.faceProcessingServiceUrl = app.faceProcessingServiceUrl;
    this.recommendationServiceUrl = app.recommendationServiceUrl;
    this.internalApiKey = app.internalApiKey;
  }

  getFaceShapeModelInfo(): Promise<unknown> {
    return this.forwardGet(
      this.faceProcessingServiceUrl,
      FACE_PROCESSING_SERVICE,
      '/admin/model-info',
    );
  }

  getPreferenceModelInfo(): Promise<unknown> {
    return this.forwardGet(
      this.recommendationServiceUrl,
      RECOMMENDATION_SERVICE,
      '/admin/model-info',
    );
  }

  getDailyEvents(params: Record<string, unknown>): Promise<unknown> {
    return this.forwardGet(
      this.recommendationServiceUrl,
      RECOMMENDATION_SERVICE,
      '/admin/analytics/events/daily',
      params,
    );
  }

  getFunnel(params: Record<string, unknown>): Promise<unknown> {
    return this.forwardGet(
      this.recommendationServiceUrl,
      RECOMMENDATION_SERVICE,
      '/admin/analytics/funnel',
      params,
    );
  }

  getTopProducts(params: Record<string, unknown>): Promise<unknown> {
    return this.forwardGet(
      this.recommendationServiceUrl,
      RECOMMENDATION_SERVICE,
      '/admin/analytics/top-products',
      params,
    );
  }

  getFaceShapeDistribution(params: Record<string, unknown>): Promise<unknown> {
    return this.forwardGet(
      this.faceProcessingServiceUrl,
      FACE_PROCESSING_SERVICE,
      '/admin/analytics/face-shapes',
      params,
    );
  }

  private async forwardGet(
    baseUrl: string,
    serviceLabel: string,
    path: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}${path}`, {
          params,
          headers: { 'X-Internal-Key': this.internalApiKey },
        }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, serviceLabel, path);
    }
  }

  /**
   * Maps a downstream failure to a clear gateway-side error instead of
   * letting it surface as an unhandled 500:
   * - downstream responded (e.g. 400, 403) -> passthrough its status/body.
   * - downstream timed out -> 504 Gateway Timeout.
   * - downstream unreachable (connection refused/reset/DNS) -> 503.
   */
  private toGatewayError(
    error: AxiosError,
    serviceLabel: string,
    path: string,
  ): HttpException {
    if (error.response) {
      return new HttpException(
        error.response.data ?? error.message,
        error.response.status,
      );
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      this.logger.error(`${serviceLabel} timed out on ${path}: ${error.message}`);
      return new HttpException(
        `${serviceLabel} không phản hồi kịp thời`,
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    this.logger.error(`${serviceLabel} unreachable on ${path}: ${error.message}`);
    return new HttpException(
      `Không thể kết nối tới ${serviceLabel}`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
