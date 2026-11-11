import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import {
  AuthenticatedUser,
  checkTokenState,
  TokenCheck,
  verifyBearerToken,
} from './jwt.guard';

/**
 * Like `JwtGuard`, but never rejects the request: it sets `request.user`
 * only when a valid, non-revoked bearer token is present, and lets anonymous
 * callers (no token, bad / expired / revoked token) through with
 * `request.user` unset. Same error mapping as `JwtGuard` (`checkTokenState`):
 * a 5xx / unreachable user-service or a 401 / 403 from the internal call
 * keeps the token's user (fails open); any other lookup error treats the
 * caller as anonymous. The route decides what to do for a guest.
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  private readonly logger = new Logger(OptionalJwtGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly permissionsCacheService: PermissionsCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const jwtSecret = this.configService.get<AppConfig>('app')!.jwtSecret;
    const user = verifyBearerToken(request, jwtSecret);
    if (!user) {
      return true;
    }

    let check: TokenCheck;
    try {
      check = await checkTokenState(user, this.permissionsCacheService);
    } catch (error) {
      this.logger.warn(
        `Token check failed for user ${user.userId}, treated as anonymous: ${(error as Error).message}`,
      );
      return true;
    }
    if (check === 'revoked') {
      return true;
    }

    (request as Request & { user?: AuthenticatedUser }).user = user;
    return true;
  }
}
