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
 * Forwards `/api/products/*` and `/api/categories/*` requests to
 * `product-service`. Holds no business logic of its own — it's a thin,
 * typed HTTP client (per README: gateway owns no data, only proxies).
 *
 * No auth guard here: edge JWT verification is explicitly deferred (see
 * api-gateway/README.md "see ADR on JWT" and the sprint plan's Q3) — these
 * routes are proxied unauthenticated for now.
 */
@Injectable()
export class ProductsProxyService {
  private readonly logger = new Logger(ProductsProxyService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<AppConfig>('app')!.productServiceUrl;
  }

  async getProducts(query: Record<string, unknown>): Promise<unknown> {
    return this.forwardGet('/products', query);
  }

  async getProductById(id: string): Promise<unknown> {
    return this.forwardGet(`/products/${id}`);
  }

  async getCategories(query: Record<string, unknown>): Promise<unknown> {
    return this.forwardGet('/categories', query);
  }

  private async forwardGet(
    path: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${path}`, { params }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  /**
   * Maps a downstream failure to a clear gateway-side error instead of
   * letting it surface as an unhandled 500:
   * - downstream responded (e.g. 404, 400) -> passthrough its status/body.
   * - downstream timed out -> 504 Gateway Timeout.
   * - downstream unreachable (connection refused/reset/DNS) -> 503.
   */
  private toGatewayError(error: AxiosError, path: string): HttpException {
    if (error.response) {
      return new HttpException(
        error.response.data ?? error.message,
        error.response.status,
      );
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      this.logger.error(`product-service timed out on ${path}: ${error.message}`);
      return new HttpException(
        'product-service did not respond in time',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    this.logger.error(`product-service unreachable on ${path}: ${error.message}`);
    return new HttpException(
      'product-service is unreachable',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
