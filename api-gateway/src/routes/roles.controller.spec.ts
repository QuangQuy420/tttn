import { PermissionsCacheService } from '../services/permissions-cache.service';
import { UsersProxyService } from '../services/users-proxy.service';
import { RolesController } from './roles.controller';

describe('RolesController', () => {
  let controller: RolesController;
  let usersProxyService: { updateRole: jest.Mock };
  let permissionsCacheService: { invalidateAll: jest.Mock };

  beforeEach(() => {
    usersProxyService = { updateRole: jest.fn() };
    permissionsCacheService = { invalidateAll: jest.fn().mockResolvedValue(undefined) };
    controller = new RolesController(
      usersProxyService as unknown as UsersProxyService,
      permissionsCacheService as unknown as PermissionsCacheService,
    );
  });

  it('update returns the upstream result and clears every cached permission set (AC5)', async () => {
    const upstream = { success: true, data: { id: 'r1' } };
    usersProxyService.updateRole.mockResolvedValue(upstream);
    const body = { name: 'EDITOR' };

    await expect(controller.update('r1', body, 'Bearer t')).resolves.toBe(upstream);

    expect(usersProxyService.updateRole).toHaveBeenCalledWith('r1', body, 'Bearer t');
    expect(permissionsCacheService.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('update propagates an upstream error and does not invalidate (AC5)', async () => {
    const error = new Error('upstream 409');
    usersProxyService.updateRole.mockRejectedValue(error);

    await expect(controller.update('r1', { name: 'X' }, 'Bearer t')).rejects.toBe(error);

    expect(permissionsCacheService.invalidateAll).not.toHaveBeenCalled();
  });
});
