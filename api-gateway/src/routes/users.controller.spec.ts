import { PermissionsCacheService } from '../services/permissions-cache.service';
import { UsersProxyService } from '../services/users-proxy.service';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  let usersProxyService: { assignRoleToUser: jest.Mock };
  let permissionsCacheService: { invalidateUser: jest.Mock };

  beforeEach(() => {
    usersProxyService = { assignRoleToUser: jest.fn() };
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
});
