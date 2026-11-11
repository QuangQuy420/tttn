import { Request } from 'express';
import { AuthenticatedUser } from '../auth/jwt.guard';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { ProductsProxyService } from '../services/products-proxy.service';
import { ProductsController } from './products.controller';

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsProxyService: { getProducts: jest.Mock };
  let permissionsCacheService: { getPermissions: jest.Mock };

  const requestAs = (userId?: string): Request & { user?: AuthenticatedUser } =>
    ({
      user: userId ? { userId, email: 'a@example.com', username: 'alice' } : undefined,
    }) as Request & { user?: AuthenticatedUser };

  beforeEach(() => {
    productsProxyService = { getProducts: jest.fn().mockResolvedValue({ success: true }) };
    permissionsCacheService = { getPermissions: jest.fn() };
    controller = new ProductsController(
      productsProxyService as unknown as ProductsProxyService,
      permissionsCacheService as unknown as PermissionsCacheService,
    );
  });

  describe('findAll', () => {
    const query = { page: '1', status: 'DRAFT', includeAllStatuses: 'true' };

    it('drops status / includeAllStatuses for a caller without product:manage (AC20)', async () => {
      permissionsCacheService.getPermissions.mockResolvedValue(['catalog:manage']);

      await controller.findAll(query, requestAs('u1'));

      expect(permissionsCacheService.getPermissions).toHaveBeenCalledWith('u1');
      expect(productsProxyService.getProducts).toHaveBeenCalledWith({ page: '1' });
    });

    it('forwards status / includeAllStatuses for a caller with product:manage (AC20)', async () => {
      permissionsCacheService.getPermissions.mockResolvedValue(['product:manage']);

      await controller.findAll(query, requestAs('u1'));

      expect(productsProxyService.getProducts).toHaveBeenCalledWith(query);
    });
  });
});
