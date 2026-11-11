import * as jwt from 'jsonwebtoken';
import { userOrIpTracker } from './rate-limit';

describe('userOrIpTracker', () => {
  const JWT_SECRET = Buffer.from('test-secret-at-least-32-bytes-long!!').toString('base64');
  const tracker = userOrIpTracker(JWT_SECRET);

  it('tracks a caller with a valid JWT by userId (Q2, AC1)', () => {
    const token = jwt.sign(
      { userId: 'u1', email: 'a@example.com', sub: 'alice' },
      Buffer.from(JWT_SECRET, 'base64'),
    );

    expect(
      tracker({ headers: { authorization: `Bearer ${token}` }, ip: '10.0.0.1' }),
    ).toBe('u1');
  });

  it('tracks a caller without a token or with an invalid token by IP (Q2, AC1)', () => {
    const badToken = jwt.sign({ userId: 'u1' }, 'some-other-secret');

    expect(tracker({ headers: {}, ip: '10.0.0.1' })).toBe('10.0.0.1');
    expect(
      tracker({ headers: { authorization: `Bearer ${badToken}` }, ip: '10.0.0.2' }),
    ).toBe('10.0.0.2');
  });
});
