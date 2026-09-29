import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
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
    guard = new OptionalJwtGuard(configService);
  });

  it('lets a request without a token through and leaves request.user unset', () => {
    const request: { headers: Record<string, string>; user?: unknown } = { headers: {} };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('lets a request with an invalid token through and leaves request.user unset', () => {
    const badToken = jwt.sign({ userId: 'u1' }, 'some-other-secret');
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: `Bearer ${badToken}` },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('sets request.user from a valid token', () => {
    const token = jwt.sign(
      { userId: 'u1', email: 'a@example.com', sub: 'alice' },
      Buffer.from(JWT_SECRET, 'base64'),
    );
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: `Bearer ${token}` },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toEqual({ userId: 'u1', email: 'a@example.com', username: 'alice' });
  });
});
