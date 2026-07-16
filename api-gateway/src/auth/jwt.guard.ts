import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { AppConfig } from '../config/configuration';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
}

/**
 * Edge JWT verification (Q1, chose option A: verify at api-gateway, no
 * separate service). Reads `Authorization: Bearer <token>`, verifies the
 * signature against the shared `JWT_SECRET`, and attaches the decoded
 * `{ userId, email, role }` claims onto `request.user` for downstream
 * guards/controllers to read.
 *
 * `user-service`'s `JwtUtil.getSigningKey()` Base64-decodes `JWT_SECRET`
 * before using it as the HMAC-SHA256 key (`Keys.hmacShaKeyFor(Decoders
 * .BASE64.decode(secret))`) — the gateway must decode the same way,
 * otherwise every signature verification fails even with matching
 * `JWT_SECRET` values in both `.env` files.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Thiếu token xác thực (bearer token)');
    }

    const jwtSecret = this.configService.get<AppConfig>('app')!.jwtSecret;
    const signingKey = Buffer.from(jwtSecret, 'base64');

    try {
      const payload = jwt.verify(token, signingKey) as jwt.JwtPayload;
      (request as Request & { user: AuthenticatedUser }).user = {
        userId: payload.userId as string,
        email: payload.email as string,
        role: payload.role as string,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) {
      return undefined;
    }

    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' ? token : undefined;
  }
}
