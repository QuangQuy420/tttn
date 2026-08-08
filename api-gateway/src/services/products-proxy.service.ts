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
 * Forwards `/api/products/*`, `/api/categories/*`, and `/api/brands/*`
 * requests to `product-service`. Holds no business logic of its own — it's
 * a thin, typed HTTP client (per README: gateway owns no data, only
 * proxies).
 *
 * Public reads do not require authentication. Write authorization is enforced
 * by the controllers: products require `product:manage`; brands and
 * categories require `catalog:manage`.
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

  async getBrands(query: Record<string, unknown>): Promise<unknown> {
    return this.forwardGet('/brands', query);
  }

  async createCategory(body: Record<string, unknown>): Promise<unknown> {
    return this.forwardPost('/categories', body);
  }

  async updateCategory(
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.forwardPatch(`/categories/${id}`, body);
  }

  async deleteCategory(id: string): Promise<unknown> {
    return this.forwardDelete(`/categories/${id}`);
  }

  async createBrand(body: Record<string, unknown>): Promise<unknown> {
    return this.forwardPost('/brands', body);
  }

  async updateBrand(
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.forwardPatch(`/brands/${id}`, body);
  }

  async deleteBrand(id: string): Promise<unknown> {
    return this.forwardDelete(`/brands/${id}`);
  }

  async createProduct(body: Record<string, unknown>): Promise<unknown> {
    const path = '/products';
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async updateProduct(
    id: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const path = `/products/${id}`;
    try {
      const response = await firstValueFrom(
        this.httpService.patch(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async deleteProduct(id: string): Promise<unknown> {
    const path = `/products/${id}`;
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${path}`),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async createVariant(
    productId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const path = `/products/${productId}/variants`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const path = `/products/${productId}/variants/${variantId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.patch(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async deleteVariant(productId: string, variantId: string): Promise<unknown> {
    const path = `/products/${productId}/variants/${variantId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${path}`),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async uploadProductImage(
    id: string,
    file: Express.Multer.File,
    variantId?: string,
  ): Promise<unknown> {
    const path = `/products/${id}/images`;
    const form = new FormData();
    if (variantId) {
      form.append('variantId', variantId);
    }
    form.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, form, {
          headers: form.getHeaders(),
        }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async setProductImageThumbnail(
    productId: string,
    imageId: string,
  ): Promise<unknown> {
    const path = `/products/${productId}/images/${imageId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.patch(`${this.baseUrl}${path}`, { isThumbnail: true }),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  async deleteProductImage(productId: string, imageId: string): Promise<unknown> {
    const path = `/products/${productId}/images/${imageId}`;
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${path}`),
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

  private async forwardPost(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  private async forwardPatch(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.patch(`${this.baseUrl}${path}`, body),
      );
      return response.data;
    } catch (error) {
      throw this.toGatewayError(error as AxiosError, path);
    }
  }

  private async forwardDelete(path: string): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.delete(`${this.baseUrl}${path}`),
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
