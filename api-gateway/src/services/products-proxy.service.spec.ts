import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { ProductsProxyService } from './products-proxy.service';

describe('ProductsProxyService', () => {
  let service: ProductsProxyService;
  let httpService: { get: jest.Mock };
  let configService: { get: jest.Mock };

  const PRODUCT_SERVICE_URL = 'http://product-service:3002';

  beforeEach(() => {
    httpService = { get: jest.fn() };
    configService = {
      get: jest.fn().mockReturnValue({
        productServiceUrl: PRODUCT_SERVICE_URL,
        downstreamTimeoutMs: 5000,
      }),
    };

    service = new ProductsProxyService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  function axiosResponse<T>(data: T): AxiosResponse<T> {
    return {
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    };
  }

  describe('getProducts', () => {
    it('forwards to GET /products with the query params and returns the body', async () => {
      const body = { items: [{ id: '1', name: 'Aviator' }], total: 1 };
      httpService.get.mockReturnValue(of(axiosResponse(body)));

      const result = await service.getProducts({ page: '1', frameShape: 'AVIATOR' });

      expect(httpService.get).toHaveBeenCalledWith(
        `${PRODUCT_SERVICE_URL}/products`,
        { params: { page: '1', frameShape: 'AVIATOR' } },
      );
      expect(result).toEqual(body);
    });
  });

  describe('getProductById', () => {
    it('forwards to GET /products/:id and returns the body', async () => {
      const body = { id: '1', name: 'Aviator' };
      httpService.get.mockReturnValue(of(axiosResponse(body)));

      const result = await service.getProductById('1');

      expect(httpService.get).toHaveBeenCalledWith(
        `${PRODUCT_SERVICE_URL}/products/1`,
        { params: undefined },
      );
      expect(result).toEqual(body);
    });

    it('passes through a downstream 404 as an HttpException with the same status', async () => {
      const axiosError = {
        isAxiosError: true,
        message: 'Request failed with status code 404',
        response: {
          status: 404,
          data: { message: 'Product not found' },
        },
      } as AxiosError;
      httpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.getProductById('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: { message: 'Product not found' },
      });
    });
  });

  describe('getCategories', () => {
    it('forwards to GET /categories and returns the body', async () => {
      const body = [{ id: '1', name: 'Sunglasses' }];
      httpService.get.mockReturnValue(of(axiosResponse(body)));

      const result = await service.getCategories({});

      expect(httpService.get).toHaveBeenCalledWith(
        `${PRODUCT_SERVICE_URL}/categories`,
        { params: {} },
      );
      expect(result).toEqual(body);
    });
  });

  describe('downstream failure handling', () => {
    it('maps an unreachable downstream (no response) to 503 Service Unavailable', async () => {
      const axiosError = {
        isAxiosError: true,
        message: 'connect ECONNREFUSED 127.0.0.1:3002',
        code: 'ECONNREFUSED',
      } as AxiosError;
      httpService.get.mockReturnValue(throwError(() => axiosError));

      const error = (await service.getProducts({}).catch((e: unknown) => e)) as HttpException;

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(error.getResponse()).toContain('unreachable');
    });

    it('maps a timeout to 504 Gateway Timeout', async () => {
      const axiosError = {
        isAxiosError: true,
        message: 'timeout of 5000ms exceeded',
        code: 'ECONNABORTED',
      } as AxiosError;
      httpService.get.mockReturnValue(throwError(() => axiosError));

      const error = (await service.getProducts({}).catch((e: unknown) => e)) as HttpException;

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
    });
  });
});
