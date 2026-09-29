import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import {
  ResponseEnvelopeInterceptor,
  SUCCESS_MESSAGE,
} from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps a controller object into the success envelope', async () => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const context = {
      getClass: () => class PaymentsController {},
    } as unknown as ExecutionContext;
    const payment = { id: 'p1', status: 'SUCCEEDED' };
    const next: CallHandler = { handle: () => of(payment) };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({
      success: true,
      message: SUCCESS_MESSAGE,
      data: payment,
    });
  });
});
