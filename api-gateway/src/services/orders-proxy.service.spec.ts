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
  describe('checkout', () => {
    const CHECKOUT_URL = `${ORDER_SERVICE_URL}/api/v1/users/user-1/checkout`;
    const body = { shippingAddress: 'HN', paymentMethod: 'COD' };

    it('forwards Idempotency-Key and maps idempotent-replayed to replayed: true', async () => {
      const upstream = { success: true, data: { orderId: 'o1' } };
      httpService.post.mockReturnValue(
        of({
          data: upstream,
          status: 201,
          headers: { 'idempotent-replayed': 'true' },
        } as unknown as AxiosResponse),
      );

      const result = await service.checkout('user-1', body, 'key-123');

      expect(httpService.post).toHaveBeenCalledWith(CHECKOUT_URL, body, {
        headers: { 'Idempotency-Key': 'key-123' },
      });
      expect(result).toEqual({ data: upstream, replayed: true });
    });

    it('sends no headers config when no Idempotency-Key is given', async () => {
      const upstream = { success: true, data: { orderId: 'o2' } };
      httpService.post.mockReturnValue(
        of({ data: upstream, status: 201, headers: {} } as AxiosResponse),
      );

      const result = await service.checkout('user-1', body);

      expect(httpService.post).toHaveBeenCalledWith(CHECKOUT_URL, body, undefined);
      expect(result).toEqual({ data: upstream, replayed: false });
    });
  });
});
