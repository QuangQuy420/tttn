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
  /** JWT `sub` claim — user-service puts the username there. */
  username: string;
}

/**
 * Shared bearer-token check used by `JwtGuard` and `OptionalJwtGuard`.
 * Returns the decoded user when the `Authorization: Bearer <token>` header
 * holds a token signed with `JWT_SECRET` (Base64-decoded, see `JwtGuard`);
 * returns `undefined` when the header is missing, malformed, or the token
 * is invalid/expired. Never throws.
 */
export function verifyBearerToken(
  request: Request,
  jwtSecret: string,
): AuthenticatedUser | undefined {
  const token = extractBearerToken(request);
  if (!token) {
    return undefined;
  }

  const signingKey = Buffer.from(jwtSecret, 'base64');
  try {
    const payload = jwt.verify(token, signingKey) as jwt.JwtPayload;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      username: payload.sub as string,
    };
  } catch {
    return undefined;
  }
}

export function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' ? token : undefined;
}

/**
 * Edge JWT verification (Q1, chose option A: verify at api-gateway, no
 * separate service). Reads `Authorization: Bearer <token>`, verifies the
 * signature against the shared `JWT_SECRET`, and attaches the decoded
 * `{ userId, email, username }` claims onto `request.user` for downstream
 * guards/controllers to read. The JWT no longer carries a `role`/`roles`
 * claim — authorization is decided live via `PermissionsGuard`
 * (`permissions.guard.ts`), which asks user-service for the caller's
 * *current* permissions on every gated request, not from a token snapshot.
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

    if (!extractBearerToken(request)) {
      throw new UnauthorizedException('Thiếu token xác thực (bearer token)');
    }

    const jwtSecret = this.configService.get<AppConfig>('app')!.jwtSecret;
    const user = verifyBearerToken(request, jwtSecret);
    if (!user) {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    (request as Request & { user: AuthenticatedUser }).user = user;
    return true;
  }
}
