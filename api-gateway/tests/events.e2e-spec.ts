import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppConfig } from '../src/config/configuration';
import { BehaviorEventPublisherService } from '../src/services/behavior-event-publisher.service';

/**
 * `POST /api/events` — RabbitMQ is not running while this suite executes, so
 * `BehaviorEventPublisherService` is stubbed; this exercises the real guard,
 * validation pipe and controller mapping through the gateway's HTTP stack.
 */
describe('Behavior events (e2e)', () => {
  let app: INestApplication;
  let publisher: { publish: jest.Mock };
  let token: string;

  const USER_ID = '11111111-1111-4111-8111-111111111111';
  const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';

  function event(overrides: Record<string, unknown> = {}) {
    return {
      eventId: '33333333-3333-4333-8333-333333333333',
      eventType: 'VIEW',
      productId: PRODUCT_ID,
      occurredAt: new Date().toISOString(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    publisher = { publish: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BehaviorEventPublisherService)
      .useValue(publisher)
      .compile();

    // Sign the token the way user-service does: HMAC key = Base64-decoded JWT_SECRET.
    const jwtSecret = moduleRef.get(ConfigService).get<AppConfig>('app')!.jwtSecret;
    token = jwt.sign(
      { userId: USER_ID, email: 'a@example.com', sub: 'alice' },
      Buffer.from(jwtSecret, 'base64'),
      { expiresIn: '1h' },
    );

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('without a token → 202 {accepted: 0} and nothing is published (AC2)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/events')
      .send({ events: [event()] })
      .expect(202);

    expect(res.body).toEqual({ accepted: 0 });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('with a valid token → 202 {accepted: 2}, publishes each event with the JWT userId and source "web"; body userId is ignored (AC1, AC4)', async () => {
    const tryOn = event({
      eventId: '44444444-4444-4444-8444-444444444444',
      eventType: 'TRY_ON',
      userId: 'attacker-chosen-id',
      context: { durationMs: 3000, faceShape: 'OVAL' },
    });

    const res = await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ events: [event({ userId: 'attacker-chosen-id' }), tryOn] })
      .expect(202);

    expect(res.body).toEqual({ accepted: 2 });
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    expect(publisher.publish).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventId: '33333333-3333-4333-8333-333333333333',
        eventType: 'VIEW',
        userId: USER_ID,
        productId: PRODUCT_ID,
        source: 'web',
      }),
    );
    expect(publisher.publish).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: 'TRY_ON',
        userId: USER_ID,
        source: 'web',
        context: { durationMs: 3000, faceShape: 'OVAL' },
      }),
    );
  });

  it('clamps a far-future occurredAt to server time (UTC with Z)', async () => {
    const before = Date.now();

    await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ events: [event({ occurredAt: '2099-01-01T00:00:00Z' })] })
      .expect(202);

    const published = publisher.publish.mock.calls[0][0] as { occurredAt: string };
    expect(published.occurredAt).toMatch(/Z$/);
    const time = new Date(published.occurredAt).getTime();
    expect(time).toBeGreaterThanOrEqual(before - 1000);
    expect(time).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('rejects a batch of 21 events with 400 (AC3)', async () => {
    await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ events: Array.from({ length: 21 }, () => event()) })
      .expect(400);

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('rejects eventType PURCHASE from the browser with 400 (AC3)', async () => {
    await request(app.getHttpServer())
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ events: [event({ eventType: 'PURCHASE' })] })
      .expect(400);

    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
