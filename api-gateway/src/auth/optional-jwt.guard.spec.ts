import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { OptionalJwtGuard } from './optional-jwt.guard';

describe('OptionalJwtGuard', () => {
  const JWT_SECRET = Buffer.from('test-secret-at-least-32-bytes-long!!').toString('base64');
  let guard: OptionalJwtGuard;

  function contextFor(request: { headers: Record<string, string>; user?: unknown }) {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue({ jwtSecret: JWT_SECRET }),
    } as unknown as ConfigService;
    const permissionsCacheService = {
      getAuthState: jest
        .fn()
        .mockResolvedValue({ permissions: [], status: 'ACTIVE', tokensValidAfter: null }),
    } as unknown as PermissionsCacheService;
    guard = new OptionalJwtGuard(configService, permissionsCacheService);
  });

  it('lets a request without a token through and leaves request.user unset', async () => {
    const request: { headers: Record<string, string>; user?: unknown } = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('lets a request with an invalid token through and leaves request.user unset', async () => {
    const badToken = jwt.sign({ userId: 'u1' }, 'some-other-secret');
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: `Bearer ${badToken}` },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('sets request.user from a valid token', async () => {
    const token = jwt.sign(
      { userId: 'u1', email: 'a@example.com', sub: 'alice' },
      Buffer.from(JWT_SECRET, 'base64'),
    );
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: `Bearer ${token}` },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({ userId: 'u1', email: 'a@example.com', username: 'alice' }),
    );
  });
});
