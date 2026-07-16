import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthenticatedUser } from './jwt.guard';
import { ROLES_KEY } from './roles.decorator';

/**
 * Checks `request.user.role` (set by `JwtGuard`, which must run first)
 * against the roles declared via `@Roles(...)` on the route/controller.
 * No `@Roles()` metadata -> allow (role check is opt-in per route).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    if (!requiredRoles.includes(request.user?.role)) {
      throw new ForbiddenException('Không đủ quyền truy cập');
    }

    return true;
  }
}
