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
import { AuthenticatedUser } from '../auth/jwt.guard';
import { AppConfig } from '../config/configuration';

type Headers = Record<string, string>;
type Params = Record<string, unknown>;

/**
 * Forwards `/api/wishlist/*`, `/api/products/:id/reviews/*` and
 * `/api/admin/reviews/*` requests to `product-service`. Holds no business
 * logic of its own — it's a thin, typed HTTP client (per README: gateway
 * owns no data, only proxies).
 *
 * product-service has no auth of its own, so user-scoped routes send the
 * caller's identity from the verified JWT as `X-User-Id` (and `X-User-Name`
 * when a review is created). Upstream bodies/statuses pass through unchanged.
 */
@Injectable()
export class EngagementProxyService {
  private readonly logger = new Logger(EngagementProxyService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<AppConfig>('app')!.productServiceUrl;
  }

  async getWishlist(user: AuthenticatedUser, query: Params): Promise<unknown> {
    return this.get('/wishlist', this.userHeaders(user), query);
  }

  async getWishlistProductIds(user: AuthenticatedUser): Promise<unknown> {
    return this.get('/wishlist/product-ids', this.userHeaders(user));
  }

  async addToWishlist(
    user: AuthenticatedUser,
    productId: string,
  ): Promise<unknown> {
    return this.post(
      `/wishlist/${encodeURIComponent(productId)}`,
      this.userHeaders(user),
    );
  }

  async removeFromWishlist(
    user: AuthenticatedUser,
    productId: string,
  ): Promise<unknown> {
    return this.delete(
      `/wishlist/${encodeURIComponent(productId)}`,
      this.userHeaders(user),
    );
  }

  async getReviewSummary(productId: string): Promise<unknown> {
    return this.get(
      `/products/${encodeURIComponent(productId)}/reviews/summary`,
    );
  }

  async getReviews(productId: string, query: Params): Promise<unknown> {
    return this.get(
      `/products/${encodeURIComponent(productId)}/reviews`,
      undefined,
      query,
    );
  }

  async getMyReview(
    user: AuthenticatedUser,
    productId: string,
  ): Promise<unknown> {
    return this.get(
      `/products/${encodeURIComponent(productId)}/reviews/mine`,
      this.userHeaders(user),
    );
  }

  async createReview(
    user: AuthenticatedUser,
    productId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.post(
      `/products/${encodeURIComponent(productId)}/reviews`,
      { ...this.userHeaders(user), 'X-User-Name': user.username },
      body,
    );
  }

  async updateMyReview(
    user: AuthenticatedUser,
    productId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.patch(
      `/products/${encodeURIComponent(productId)}/reviews/mine`,
      this.userHeaders(user),
      body,
    );
  }

  async deleteMyReview(
    user: AuthenticatedUser,
    productId: string,
  ): Promise<unknown> {
    return this.delete(
      `/products/${encodeURIComponent(productId)}/reviews/mine`,
      this.userHeaders(user),
    );
  }

  async getAdminReviews(query: Params): Promise<unknown> {
    return this.get('/admin/reviews', undefined, query);
  }

  async updateReviewStatus(
    reviewId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.patch(
      `/admin/reviews/${encodeURIComponent(reviewId)}/status`,
      undefined,
      body,
    );
  }

  private userHeaders(user: AuthenticatedUser): Headers {
    return { 'X-User-Id': user.userId };
  }

  private async get(
    path: string,
    headers?: Headers,
    params?: Params,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${path}`, { headers, params }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  private async post(
    path: string,
    headers: Headers,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, body, { headers }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  private async patch(
    path: string,
    headers: Headers | undefined,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.patch(`${this.baseUrl}${path}`, body, { headers }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  private async delete(path: string, headers: Headers): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${path}`, { headers }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  /**
   * Maps a downstream failure to a clear gateway-side error instead of
   * letting it surface as an unhandled 500:
   * - downstream responded (e.g. 404, 409) -> passthrough its status/body.
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
        'product-service không phản hồi kịp thời',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    this.logger.error(`product-service unreachable on ${path}: ${error.message}`);
    return new HttpException(
      'Không thể kết nối tới product-service',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
