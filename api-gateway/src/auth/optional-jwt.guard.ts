import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { AuthenticatedUser, verifyBearerToken } from './jwt.guard';

/**
 * Like `JwtGuard`, but never rejects the request: it sets `request.user`
 * only when a valid bearer token is present, and lets anonymous callers
 * (no token, bad token, expired token) through with `request.user` unset.
 * The route decides what to do for a guest.
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const jwtSecret = this.configService.get<AppConfig>('app')!.jwtSecret;
    const user = verifyBearerToken(request, jwtSecret);
    if (user) {
      (request as Request & { user?: AuthenticatedUser }).user = user;
    }
    return true;
  }
}
