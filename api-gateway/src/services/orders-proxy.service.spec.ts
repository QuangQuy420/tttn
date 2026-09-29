import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { of } from 'rxjs';
import { OrdersProxyService } from './orders-proxy.service';

describe('OrdersProxyService', () => {
  const ORDER_SERVICE_URL = 'http://order-service:3003';
  let service: OrdersProxyService;
  let httpService: { post: jest.Mock };

  beforeEach(() => {
    httpService = { post: jest.fn() };
    const configService = {
      get: jest.fn().mockReturnValue({ orderServiceUrl: ORDER_SERVICE_URL }),
    };
    service = new OrdersProxyService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  describe('refreshCart', () => {
    it('forwards to POST /api/v1/carts/{userId}/refresh and returns the body', async () => {
      const body = {
        success: true,
        message: 'Thành công',
        data: { cart: { items: [] }, changedVariantIds: ['v1'] },
      };
      httpService.post.mockReturnValue(
        of({ data: body, status: 200 } as AxiosResponse),
      );

      const result = await service.refreshCart('user-1');

      expect(httpService.post).toHaveBeenCalledWith(
        `${ORDER_SERVICE_URL}/api/v1/carts/user-1/refresh`,
      );
      expect(result).toEqual(body);
    });
  });
});
