import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import * as FormData from 'form-data';
import { of, throwError } from 'rxjs';
import { ProductsProxyService } from './products-proxy.service';

describe('ProductsProxyService', () => {
  let service: ProductsProxyService;
  let httpService: { get: jest.Mock; post: jest.Mock };
  let configService: { get: jest.Mock };

  const PRODUCT_SERVICE_URL = 'http://product-service:3002';

  beforeEach(() => {
    httpService = { get: jest.fn(), post: jest.fn() };
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
      const body = {
        success: true,
        message: 'Thành công',
        data: [{ id: '1', name: 'Aviator' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
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
      const body = { success: true, message: 'Thành công', data: { id: '1', name: 'Aviator' } };
      httpService.get.mockReturnValue(of(axiosResponse(body)));

      const result = await service.getProductById('1');

      expect(httpService.get).toHaveBeenCalledWith(
        `${PRODUCT_SERVICE_URL}/products/1`,
        { params: undefined },
      );
      expect(result).toEqual(body);
    });

    it('passes through a downstream 404 envelope as an HttpException with the same status', async () => {
      const envelope = {
        success: false,
        message: 'Không tìm thấy sản phẩm',
        error: { code: 'NOT_FOUND', details: null },
      };
      const axiosError = {
        isAxiosError: true,
        message: 'Request failed with status code 404',
        response: {
          status: 404,
          data: envelope,
        },
      } as AxiosError;
      httpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.getProductById('missing')).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
        response: envelope,
      });
    });
  });

  describe('getCategories', () => {
    it('forwards to GET /categories and returns the body', async () => {
      const body = {
        success: true,
        message: 'Thành công',
        data: [{ id: '1', name: 'Sunglasses' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      httpService.get.mockReturnValue(of(axiosResponse(body)));

      const result = await service.getCategories({});

      expect(httpService.get).toHaveBeenCalledWith(
        `${PRODUCT_SERVICE_URL}/categories`,
        { params: {} },
      );
      expect(result).toEqual(body);
    });
  });

  describe('uploadProductImage', () => {
    const file = {
      buffer: Buffer.from('png-bytes'),
      originalname: 'try-on.png',
      mimetype: 'image/png',
    } as Express.Multer.File;

    function sentFormBody(): string {
      const form = httpService.post.mock.calls[0][1] as FormData;
      return form.getBuffer().toString();
    }

    it('appends kind to the multipart form when given and forwards to POST /products/:id/images', async () => {
      const body = { success: true, message: 'Thành công', data: { id: 'img-1', kind: 'TRY_ON' } };
      httpService.post.mockReturnValue(of(axiosResponse(body)));

      const result = await service.uploadProductImage('p1', file, undefined, 'TRY_ON');

      expect(httpService.post).toHaveBeenCalledWith(
        `${PRODUCT_SERVICE_URL}/products/p1/images`,
        expect.any(FormData),
        expect.objectContaining({ headers: expect.any(Object) }),
      );
      expect(sentFormBody()).toMatch(/name="kind"\r\n\r\nTRY_ON\r\n/);
      expect(result).toEqual(body);
    });

    it('does not append kind when it is not given', async () => {
      httpService.post.mockReturnValue(of(axiosResponse({ id: 'img-1' })));

      await service.uploadProductImage('p1', file);

      expect(sentFormBody()).not.toContain('name="kind"');
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
      expect(error.getResponse()).toContain('Không thể kết nối');
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
