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
 * Forwards `/api/cart/*` and `/api/orders/*` requests to `order-service`.
 * Holds no business logic of its own — it's a thin, typed HTTP client (per
 * README: gateway owns no data, only proxies).
 *
 * order-service's cart/order endpoints take `userId` as a path segment
 * (`/api/v1/carts/{userId}/...`, `/api/v1/users/{userId}/orders/...`), so
 * every method here takes `userId` as an explicit parameter supplied by the
 * controller from the verified JWT (`request.user.userId`) — never read
 * from the request body.
 */
@Injectable()
export class OrdersProxyService {
  private readonly logger = new Logger(OrdersProxyService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<AppConfig>('app')!.orderServiceUrl;
  }

  async getCart(userId: string): Promise<unknown> {
    return this.forwardGet(`/api/v1/carts/${userId}`);
  }

  async addCartItem(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const path = `/api/v1/carts/${userId}/items`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async updateCartItem(
    userId: string,
    variantId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const path = `/api/v1/carts/${userId}/items/${variantId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.put(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async removeCartItem(userId: string, variantId: string): Promise<unknown> {
    const path = `/api/v1/carts/${userId}/items/${variantId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${path}`),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async clearCart(userId: string): Promise<unknown> {
    const path = `/api/v1/carts/${userId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${path}`),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async checkout(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const path = `/api/v1/users/${userId}/checkout`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async getOrders(
    userId: string,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.forwardGet(`/api/v1/users/${userId}/orders`, query);
  }

  async getOrderDetail(userId: string, orderId: string): Promise<unknown> {
    return this.forwardGet(`/api/v1/users/${userId}/orders/${orderId}`);
  }

  async cancelOrder(
    userId: string,
    orderId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const path = `/api/v1/users/${userId}/orders/${orderId}/cancel`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
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
      this.logger.error(`order-service timed out on ${path}: ${error.message}`);
      return new HttpException(
        'order-service không phản hồi kịp thời',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }

    this.logger.error(`order-service unreachable on ${path}: ${error.message}`);
    return new HttpException(
      'Không thể kết nối tới order-service',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
