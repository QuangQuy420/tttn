import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppConfig } from '../src/config/configuration';
import { AdminAnalyticsProxyService } from '../src/services/admin-analytics-proxy.service';
import { BehaviorEventPublisherService } from '../src/services/behavior-event-publisher.service';
import { PermissionsCacheService } from '../src/services/permissions-cache.service';
import { RedisService } from '../src/services/redis.service';

/**
 * `/api/admin/ai/*` and `/api/admin/analytics/*` through the real `JwtGuard`,
 * `PermissionsGuard` and validation pipe. Redis, RabbitMQ, the permission
 * lookup and the upstream proxy are stubbed — no stack needed.
 */
describe('Admin AI + analytics (e2e)', () => {
  let app: INestApplication;
  let permissions: { getPermissions: jest.Mock };
  let proxy: Record<string, jest.Mock>;
  let token: string;

  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const data = { success: true, message: 'Thành công', data: {} };

  beforeEach(async () => {
    permissions = { getPermissions: jest.fn().mockResolvedValue(['order:manage']) };
    proxy = {
      getFaceShapeModelInfo: jest.fn().mockResolvedValue(data),
      getPreferenceModelInfo: jest.fn().mockResolvedValue(data),
      getDailyEvents: jest.fn().mockResolvedValue(data),
      getFunnel: jest.fn().mockResolvedValue(data),
      getTopProducts: jest.fn().mockResolvedValue(data),
      getFaceShapeDistribution: jest.fn().mockResolvedValue(data),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BehaviorEventPublisherService)
      .useValue({ publish: jest.fn() })
      .overrideProvider(RedisService)
      .useValue({
        get: jest.fn().mockResolvedValue(null),
        setEx: jest.fn(),
        del: jest.fn(),
        delByPattern: jest.fn(),
      })
      .overrideProvider(PermissionsCacheService)
      .useValue(permissions)
      .overrideProvider(AdminAnalyticsProxyService)
      .useValue(proxy)
      .compile();

    // Sign the token the way user-service does: HMAC key = Base64-decoded JWT_SECRET.
    const jwtSecret = moduleRef.get(ConfigService).get<AppConfig>('app')!.jwtSecret;
    token = jwt.sign(
      { userId: USER_ID, email: 'admin@example.com', sub: 'admin' },
      Buffer.from(jwtSecret, 'base64'),
      { expiresIn: '1h' },
    );

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['/api/admin/ai/face-shape-model', '/api/admin/analytics/funnel'])(
    'GET %s without a token → 401 (AC8)',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);

      expect(Object.values(proxy).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    },
  );

  it.each(['/api/admin/ai/preference-model', '/api/admin/analytics/top-products'])(
    'GET %s with a token lacking order:manage → 403 (AC8)',
    async (path) => {
      permissions.getPermissions.mockResolvedValue(['product:manage']);

      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(permissions.getPermissions).toHaveBeenCalledWith(USER_ID);
      expect(Object.values(proxy).every((fn) => fn.mock.calls.length === 0)).toBe(true);
    },
  );

  it('admin with order:manage → 200 and the validated query is forwarded (AC8, AC11)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/analytics/top-products')
      .query({ from: '2026-09-01', to: '2026-09-30', source: 'all', limit: '5' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual(data);
    expect(proxy.getTopProducts).toHaveBeenCalledWith({
      from: '2026-09-01',
      to: '2026-09-30',
      source: 'all',
      limit: 5,
    });
  });

  it('limit=100 → 400 and nothing is forwarded upstream (AC11)', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/analytics/top-products')
      .query({ limit: '100' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(proxy.getTopProducts).not.toHaveBeenCalled();
  });
});
