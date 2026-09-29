import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';
import { paginated } from './api-response';

function makeContext(): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function handlerReturning(body: unknown): CallHandler {
  return { handle: () => of(body) };
}

describe('ResponseEnvelopeInterceptor', () => {
  let interceptor: ResponseEnvelopeInterceptor;

  beforeEach(() => {
    interceptor = new ResponseEnvelopeInterceptor(new Reflector());
  });

  it('wraps a plain object into { success, message, data } (AC1)', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), handlerReturning({ id: 'p-1' })),
    );

    expect(result).toEqual({
      success: true,
      message: 'Thành công',
      data: { id: 'p-1' },
    });
  });

  it('emits data = items plus meta for a paginated result (AC3)', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext(),
        handlerReturning(paginated([{ id: 'p-21' }], 21, 2, 20)),
      ),
    );

    expect(result).toEqual({
      success: true,
      message: 'Thành công',
      data: [{ id: 'p-21' }],
      meta: { page: 2, limit: 20, total: 21, totalPages: 2 },
    });
  });
});
