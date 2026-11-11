import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PermissionsCacheService } from '../services/permissions-cache.service';
import { JwtGuard } from './jwt.guard';

describe('JwtGuard', () => {
  // user-service signs with the Base64-DECODED secret; the guard does the same.
  const JWT_SECRET = Buffer.from('test-secret-at-least-32-bytes-long!!').toString('base64');
  const IAT = 1_700_000_000;
  let guard: JwtGuard;
  let permissionsCacheService: { getAuthState: jest.Mock };

  const contextFor = (request: unknown): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  const requestWithToken = (): { headers: Record<string, string>; user?: unknown } => {
    const token = jwt.sign(
      // Fixed far-future `exp` keeps the test independent of the clock.
      { userId: 'u1', email: 'a@example.com', sub: 'alice', iat: IAT, exp: 4_000_000_000 },
      Buffer.from(JWT_SECRET, 'base64'),
    );
    return { headers: { authorization: `Bearer ${token}` } };
  };

  beforeAll(() => {
    // The fail-open paths log WARN / ERROR on purpose; keep the test output clean.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue({ jwtSecret: JWT_SECRET }),
    } as unknown as ConfigService;
    permissionsCacheService = { getAuthState: jest.fn() };
    guard = new JwtGuard(
      configService,
      permissionsCacheService as unknown as PermissionsCacheService,
    );
  });

  it('rejects a signature-valid token issued before tokensValidAfter with 401 (AC8)', async () => {
    permissionsCacheService.getAuthState.mockResolvedValue({
      permissions: [],
      status: 'ACTIVE',
      tokensValidAfter: IAT + 1,
    });
    const request = requestWithToken();

    const result = guard.canActivate(contextFor(request));

    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(result).rejects.toThrow(
      'Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại',
    );
    expect(permissionsCacheService.getAuthState).toHaveBeenCalledWith('u1');
    expect(request.user).toBeUndefined();
  });

  it('accepts a token issued at or after tokensValidAfter and sets request.user (AC8)', async () => {
    permissionsCacheService.getAuthState.mockResolvedValue({
      permissions: [],
      status: 'ACTIVE',
      tokensValidAfter: IAT,
    });
    const request = requestWithToken();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({ userId: 'u1', username: 'alice', iat: IAT }),
    );
  });

  it.each([
    ['503 (user-service down)', HttpStatus.SERVICE_UNAVAILABLE],
    ['403 (internal key rejected)', HttpStatus.FORBIDDEN],
  ])(
    'fails open when the auth-state lookup fails with %s (AC8)',
    async (_label, status) => {
      permissionsCacheService.getAuthState.mockRejectedValue(
        new HttpException('upstream', status),
      );
      const request = requestWithToken();

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toEqual(expect.objectContaining({ userId: 'u1' }));
    },
  );
});
