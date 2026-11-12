import { pickQuery } from '../common/pick-query';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { AuthenticatedUser } from './jwt.guard';

/**
 * Soft permission check for public routes behind `OptionalJwtGuard`: unlike
 * `PermissionsGuard` it never throws — a guest, a caller without the
 * permission, or a failed lookup (user-service down) all yield `false`.
 */
export async function hasPermission(
  permissionsCacheService: PermissionsCacheService,
  user: AuthenticatedUser | undefined,
  permission: string,
): Promise<boolean> {
  if (!user) {
    return false;
  }
  try {
    const permissions = await permissionsCacheService.getPermissions(
      user.userId,
    );
    return permissions.includes(permission);
  } catch {
    return false;
  }
}

/**
 * `pickQuery(query, keys)` when the caller holds `permission`, `{}` otherwise.
 * Used for the draft-visibility params (`status`, `includeAllStatuses`) of
 * the public product routes: only `product:manage` may see non-PUBLISHED
 * products, everyone else gets them stripped. No lookup when none is sent.
 */
export async function pickQueryIfPermitted(
  permissionsCacheService: PermissionsCacheService,
  user: AuthenticatedUser | undefined,
  permission: string,
  query: Record<string, unknown>,
  keys: string[],
): Promise<Record<string, unknown>> {
  const picked = pickQuery(query, keys);
  if (Object.keys(picked).length === 0) {
    return picked;
  }
  return (await hasPermission(permissionsCacheService, user, permission))
    ? picked
    : {};
}
