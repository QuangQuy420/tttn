import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Marks a route as requiring one or more permission codes. Read by
 * `PermissionsGuard`, which must run after `JwtGuard` (needs
 * `request.user.userId` already set) and checks the caller's *current*
 * permissions via a live lookup against user-service, not a JWT-embedded
 * snapshot.
 */
export const RequirePermission = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
