import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Request } from 'express';
import { AuthenticatedUser, JwtGuard } from '../auth/jwt.guard';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { UsersProxyService } from '../services/users-proxy.service';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  let usersProxyService: { assignRoleToUser: jest.Mock; changePassword: jest.Mock };
  let permissionsCacheService: { invalidateUser: jest.Mock };

  beforeEach(() => {
    usersProxyService = { assignRoleToUser: jest.fn(), changePassword: jest.fn() };
    permissionsCacheService = { invalidateUser: jest.fn().mockResolvedValue(undefined) };
    controller = new UsersController(
      usersProxyService as unknown as UsersProxyService,
      permissionsCacheService as unknown as PermissionsCacheService,
    );
  });

  describe('assignRole', () => {
    it('returns the upstream result and clears that user\'s cached permissions (AC5)', async () => {
      const upstream = { success: true, data: { userId: 'u1' } };
      usersProxyService.assignRoleToUser.mockResolvedValue(upstream);
      const body = { roleId: 'r1' };

      await expect(controller.assignRole('u1', body, 'Bearer t')).resolves.toBe(upstream);

      expect(usersProxyService.assignRoleToUser).toHaveBeenCalledWith('u1', body, 'Bearer t');
      expect(permissionsCacheService.invalidateUser).toHaveBeenCalledWith('u1');
    });

    it('propagates an upstream error unchanged and does not invalidate (AC5)', async () => {
      const error = new Error('upstream 404');
      usersProxyService.assignRoleToUser.mockRejectedValue(error);

      await expect(controller.assignRole('u1', { roleId: 'r1' }, 'Bearer t')).rejects.toBe(error);

      expect(permissionsCacheService.invalidateUser).not.toHaveBeenCalled();
    });
  });

  it('requires JwtGuard on every /api/users/me* and change-password route (AC5)', () => {
    const handlers = [
      UsersController.prototype.getProfile,
      UsersController.prototype.updateProfile,
      UsersController.prototype.changePassword,
      UsersController.prototype.listAddresses,
      UsersController.prototype.createAddress,
      UsersController.prototype.updateAddress,
      UsersController.prototype.deleteAddress,
    ];
    for (const handler of handlers) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(JwtGuard);
    }
  });

  describe('changePassword', () => {
    it('returns the upstream result and clears the caller\'s cached auth state (AC8)', async () => {
      const upstream = { success: true, data: null };
      usersProxyService.changePassword.mockResolvedValue(upstream);
      const body = { oldPassword: 'a', newPassword: 'b' };
      const request = {
        user: { userId: 'u1', email: 'a@example.com', username: 'alice' },
      } as Request & { user: AuthenticatedUser };

      await expect(controller.changePassword(body, request, 'Bearer t')).resolves.toBe(upstream);

      expect(usersProxyService.changePassword).toHaveBeenCalledWith(body, 'Bearer t');
      expect(permissionsCacheService.invalidateUser).toHaveBeenCalledWith('u1');
    });
  });
});
