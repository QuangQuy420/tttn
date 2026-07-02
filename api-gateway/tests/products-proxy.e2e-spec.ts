import { HttpService } from '@nestjs/axios';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * `product-service` is not necessarily running while this suite executes,
 * so `HttpService` (the only thing that talks to it) is stubbed here —
 * this test exercises real routing/param-binding/error-mapping through the
 * gateway's own HTTP stack via supertest, without a real network call.
 */
describe('Products/categories proxy (e2e)', () => {
  let app: INestApplication;
  let httpService: { get: jest.Mock };

  const PRODUCT_SERVICE_URL = 'http://product-service:3002';

  function axiosResponse<T>(data: T): AxiosResponse<T> {
    return { data, status: 200, statusText: 'OK', headers: {}, config: {} as never };
  }

  beforeEach(async () => {
    httpService = { get: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(HttpService)
      .useValue(httpService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/products forwards query params to product-service and returns its body', async () => {
    const body = { items: [{ id: '1', name: 'Aviator' }], total: 1 };
    httpService.get.mockReturnValue(of(axiosResponse(body)));

    const res = await request(app.getHttpServer())
      .get('/api/products?page=1&frameShape=AVIATOR')
      .expect(200);

    expect(res.body).toEqual(body);
    expect(httpService.get).toHaveBeenCalledWith(
      `${PRODUCT_SERVICE_URL}/products`,
      { params: { page: '1', frameShape: 'AVIATOR' } },
    );
  });

  it('GET /api/products/:id passes through a downstream 404', async () => {
    const axiosError = {
      isAxiosError: true,
      message: 'Request failed with status code 404',
      response: { status: 404, data: { message: 'Product not found' } },
    } as AxiosError;
    httpService.get.mockReturnValue(throwError(() => axiosError));

    const res = await request(app.getHttpServer())
      .get('/api/products/missing-id')
      .expect(404);

    expect(res.body).toMatchObject({ message: 'Product not found' });
  });

  it('GET /api/products returns 503 with a clear message when product-service is unreachable', async () => {
    const axiosError = {
      isAxiosError: true,
      message: 'connect ECONNREFUSED 127.0.0.1:3002',
      code: 'ECONNREFUSED',
    } as AxiosError;
    httpService.get.mockReturnValue(throwError(() => axiosError));

    const res = await request(app.getHttpServer()).get('/api/products').expect(503);

    expect(res.body.message).toContain('unreachable');
  });

  it('GET /api/categories forwards to product-service and returns its body', async () => {
    const body = [{ id: '1', name: 'Sunglasses' }];
    httpService.get.mockReturnValue(of(axiosResponse(body)));

    const res = await request(app.getHttpServer()).get('/api/categories').expect(200);

    expect(res.body).toEqual(body);
    expect(httpService.get).toHaveBeenCalledWith(
      `${PRODUCT_SERVICE_URL}/categories`,
      { params: {} },
    );
  });
});
