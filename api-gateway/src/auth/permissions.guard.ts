import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UsersProxyService } from '../services/users-proxy.service';
import { AuthenticatedUser } from './jwt.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';

/**
 * Checks the caller's *current* permissions — looked up fresh from
 * user-service on every request via `UsersProxyService.getPermissions`, not
 * a JWT-embedded snapshot — against the permission codes declared via
 * `@RequirePermission(...)` on the route/controller. No `@RequirePermission()`
 * metadata -> allow (permission check is opt-in per route). Must run after
 * `JwtGuard` (needs `request.user.userId` already set).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersProxyService: UsersProxyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    const permissions = await this.usersProxyService.getPermissions(
      request.user.userId,
    );

    const hasPermission = requiredPermissions.every((permission) =>
      permissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException('Không đủ quyền truy cập');
    }

    return true;
  }
}
