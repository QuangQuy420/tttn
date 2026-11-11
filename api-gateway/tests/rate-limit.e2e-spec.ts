import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthProxyService } from '../src/services/auth-proxy.service';
import { BehaviorEventPublisherService } from '../src/services/behavior-event-publisher.service';
import { RedisService } from '../src/services/redis.service';

/**
 * Rate limit through the real `ThrottlerGuard` (APP_GUARD) with lowered limits
 * set through env before the config factory runs. Redis, RabbitMQ and
 * user-service are stubbed — none is needed for the throttler (in-memory).
 */
describe('Rate limit + request-id (e2e)', () => {
  const LIMITS: Record<string, string> = {
    RATE_LIMIT_AUTH: '2',
    RATE_LIMIT_DEFAULT: '3',
    RATE_LIMIT_TTL_MS: '60000',
  };
  const TOO_MANY = 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút';
  const savedEnv: Record<string, string | undefined> = {};
  let app: INestApplication;
  let authProxy: { login: jest.Mock };

  beforeAll(() => {
    for (const [key, value] of Object.entries(LIMITS)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const key of Object.keys(LIMITS)) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  beforeEach(async () => {
    authProxy = { login: jest.fn().mockResolvedValue({ success: true, data: {} }) };

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
      .overrideProvider(AuthProxyService)
      .useValue(authProxy)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('login over the auth limit → 429 with the Vietnamese message and an X-Request-Id (AC2, AC9)', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 2; i++) {
      await request(server).post('/api/auth/login').send({ email: 'a@b.c' }).expect(201);
    }

    const res = await request(server)
      .post('/api/auth/login')
      .send({ email: 'a@b.c' })
      .expect(429);

    expect(res.body).toEqual({
      success: false,
      message: TOO_MANY,
      error: { code: 'TOO_MANY_REQUESTS', details: null },
    });
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(authProxy.login).toHaveBeenCalledTimes(2);
  });

  it('a route without a tier is limited by RATE_LIMIT_DEFAULT (AC1)', async () => {
    const server = app.getHttpServer();
    // No token → JwtGuard answers 401, but the throttler (APP_GUARD) counts first.
    for (let i = 0; i < 3; i++) {
      await request(server).get('/api/users').expect(401);
    }

    await request(server).get('/api/users').expect(429);
  });

  it('/health is never rate-limited and echoes a valid incoming X-Request-Id (AC3, AC9)', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 6; i++) {
      const res = await request(server)
        .get('/health')
        .set('X-Request-Id', 'healthcheck-0001')
        .expect(200);
      expect(res.headers['x-request-id']).toBe('healthcheck-0001');
    }
  });
});
