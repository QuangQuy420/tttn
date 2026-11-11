import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { AppConfig } from '../config/configuration';
import { PermissionsCacheService } from '../services/permissions-cache.service';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  /** JWT `sub` claim — user-service puts the username there. */
  username: string;
  /** JWT `iat` claim (epoch seconds) — compared with `tokensValidAfter`. */
  iat?: number;
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
      iat: payload.iat,
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

export type TokenCheck = 'valid' | 'revoked' | 'unchecked';

const tokenCheckLogger = new Logger('TokenCheck');

/**
 * Checks a signature-valid token against the user's live auth state
 * (`PermissionsCacheService.getAuthState`, cached ≤ 60 s): `revoked` when the
 * account is not ACTIVE, the token was issued before `tokensValidAfter`
 * (epoch seconds, second granularity) or user-service no longer knows the
 * user (404); `unchecked` — the caller fails open — when the lookup fails
 * with any 5xx (no response, timeout, user-service error or the cache's
 * unavailable backoff; WARN) or with 401 / 403 (the internal endpoint
 * rejected `INTERNAL_API_KEY` — a gateway misconfiguration, never the
 * user's token; ERROR, and never passed on as a 401 that would log the user
 * out). Missing `status` / `tokensValidAfter` (older user-service) count as
 * valid. Any other error is thrown.
 */
export async function checkTokenState(
  user: AuthenticatedUser,
  permissionsCacheService: PermissionsCacheService,
): Promise<TokenCheck> {
  try {
    const state = await permissionsCacheService.getAuthState(user.userId);
    if (state.status !== null && state.status !== 'ACTIVE') {
      return 'revoked';
    }
    if (
      state.tokensValidAfter !== null &&
      (user.iat === undefined || user.iat < state.tokensValidAfter)
    ) {
      return 'revoked';
    }
    return 'valid';
  } catch (error) {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === HttpStatus.NOT_FOUND) {
        return 'revoked';
      }
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        tokenCheckLogger.warn(
          `user-service failed (${status}), token revocation not checked for user ${user.userId}`,
        );
        return 'unchecked';
      }
      if (
        status === HttpStatus.UNAUTHORIZED ||
        status === HttpStatus.FORBIDDEN
      ) {
        tokenCheckLogger.error(
          `user-service rejected the internal permissions call (${status}) — check INTERNAL_API_KEY; token revocation not checked for user ${user.userId}`,
        );
        return 'unchecked';
      }
    }
    throw error;
  }
}

/**
 * Edge JWT verification (Q1, chose option A: verify at api-gateway, no
 * separate service). Reads `Authorization: Bearer <token>`, verifies the
 * signature against the shared `JWT_SECRET`, and attaches the decoded
 * `{ userId, email, username }` claims onto `request.user` for downstream
 * guards/controllers to read. The JWT no longer carries a `role`/`roles`
 * claim — authorization is decided live via `PermissionsGuard`
 * (`permissions.guard.ts`), which reads the caller's *current* permissions
 * (user-service, cached ≤ 60 s in Redis), not from a token snapshot.
 *
 * `user-service`'s `JwtUtil.getSigningKey()` Base64-decodes `JWT_SECRET`
 * before using it as the HMAC-SHA256 key (`Keys.hmacShaKeyFor(Decoders
 * .BASE64.decode(secret))`) — the gateway must decode the same way,
 * otherwise every signature verification fails even with matching
 * `JWT_SECRET` values in both `.env` files.
 *
 * Token revocation: a signature-valid token is still rejected when the
 * account is not ACTIVE or the token predates the last password change /
 * reset (`checkTokenState`). If the lookup fails on a cache miss (5xx /
 * unreachable, or 401 / 403 from a wrong internal key) the guard fails open
 * (signature + expiry only, logged by `checkTokenState`);
 * `PermissionsGuard` still fails closed.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly permissionsCacheService: PermissionsCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    if (!extractBearerToken(request)) {
      throw new UnauthorizedException('Thiếu token xác thực (bearer token)');
    }

    const jwtSecret = this.configService.get<AppConfig>('app')!.jwtSecret;
    const user = verifyBearerToken(request, jwtSecret);
    if (!user) {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    const check = await checkTokenState(user, this.permissionsCacheService);
    if (check === 'revoked') {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại',
      );
    }

    (request as Request & { user: AuthenticatedUser }).user = user;
    return true;
  }
}
