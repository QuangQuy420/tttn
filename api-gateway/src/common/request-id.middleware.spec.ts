import { Request, Response } from 'express';
import { getRequestId } from './request-context';
import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  let middleware: RequestIdMiddleware;

  function run(incoming?: string) {
    const req = {
      method: 'GET',
      originalUrl: '/api/products',
      header: jest.fn().mockReturnValue(incoming),
    } as unknown as Request;
    const res = { setHeader: jest.fn(), on: jest.fn() } as unknown as Response;
    let idInsideNext: string | undefined;
    const next = jest.fn(() => {
      idInsideNext = getRequestId();
    });

    middleware.use(req, res, next);

    return { res, next, idInsideNext };
  }

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it('keeps a valid incoming X-Request-Id, sets it on the response and in the request context (AC9)', () => {
    const { res, next, idInsideNext } = run('client-req-12345');

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-req-12345');
    expect(next).toHaveBeenCalledTimes(1);
    expect(idInsideNext).toBe('client-req-12345');
  });

  it('replaces an invalid incoming id with a new UUID (AC9)', () => {
    const { res, idInsideNext } = run('bad id; DROP');

    const [[header, value]] = (res.setHeader as jest.Mock).mock.calls;
    expect(header).toBe('X-Request-Id');
    expect(value).toMatch(UUID_PATTERN);
    expect(idInsideNext).toBe(value);
  });
});
