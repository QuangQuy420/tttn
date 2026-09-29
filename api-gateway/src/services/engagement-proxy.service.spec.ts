import { HttpService } from '@nestjs/axios';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { AuthenticatedUser } from '../auth/jwt.guard';
import { EngagementProxyService } from './engagement-proxy.service';

describe('EngagementProxyService', () => {
  let service: EngagementProxyService;
  let httpService: { post: jest.Mock };
  let configService: { get: jest.Mock };

  const PRODUCT_SERVICE_URL = 'http://product-service:3002';
  const user: AuthenticatedUser = {
    userId: 'user-1',
    email: 'alice@example.com',
    username: 'alice',
  };

  beforeEach(() => {
    httpService = { post: jest.fn() };
    configService = {
      get: jest.fn().mockReturnValue({
        productServiceUrl: PRODUCT_SERVICE_URL,
        downstreamTimeoutMs: 5000,
      }),
    };

    service = new EngagementProxyService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  function axiosResponse<T>(data: T): AxiosResponse<T> {
    return {
      data,
      status: 201,
      statusText: 'Created',
      headers: {},
      config: {} as never,
    };
  }

  describe('createReview', () => {
    it('forwards to POST /products/:id/reviews with X-User-Id + X-User-Name and returns the body unchanged', async () => {
      const body = {
        success: true,
        message: 'Thành công',
        data: { id: 'r1', productId: 'p1', rating: 5, reviewerName: 'alice' },
      };
      httpService.post.mockReturnValue(of(axiosResponse(body)));
      const reviewBody = { rating: 5, comment: 'Great' };

      const result = await service.createReview(user, 'p1', reviewBody);

      expect(httpService.post).toHaveBeenCalledWith(
        `${PRODUCT_SERVICE_URL}/products/p1/reviews`,
        reviewBody,
        { headers: { 'X-User-Id': 'user-1', 'X-User-Name': 'alice' } },
      );
      expect(result).toEqual(body);
    });

    it('passes through a downstream 403 envelope as an HttpException with the same status', async () => {
      const envelope = {
        success: false,
        message: 'Bạn cần mua sản phẩm trước khi đánh giá',
        error: { code: 'FORBIDDEN', details: null },
      };
      const axiosError = {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: { status: 403, data: envelope },
      } as AxiosError;
      httpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        service.createReview(user, 'p1', { rating: 5 }),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: envelope,
      });
    });
  });
});
