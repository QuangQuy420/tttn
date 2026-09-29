import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/jwt.guard';
import { OrdersProxyService } from '../services/orders-proxy.service';
import { OrdersController } from './orders.controller';

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersProxyService: { checkout: jest.Mock };

  beforeEach(() => {
    ordersProxyService = { checkout: jest.fn() };
    controller = new OrdersController(
      ordersProxyService as unknown as OrdersProxyService,
    );
  });

  describe('checkout', () => {
    it('passes the Idempotency-Key through and sets Idempotent-Replayed on replay', async () => {
      const data = { success: true, data: { orderId: 'o1' } };
      ordersProxyService.checkout.mockResolvedValue({ data, replayed: true });
      const request = { user: { userId: 'user-1' } } as unknown as Request & {
        user: AuthenticatedUser;
      };
      const response = { setHeader: jest.fn() } as unknown as Response;
      const body = { paymentMethod: 'COD' };

      const result = await controller.checkout(body, request, response, 'key-123');

      expect(ordersProxyService.checkout).toHaveBeenCalledWith(
        'user-1',
        body,
        'key-123',
      );
      expect(response.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
      expect(result).toEqual(data);
    });
  });
});
