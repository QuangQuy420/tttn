import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AnalyticsEventsQueryDto,
  TopProductsQueryDto,
} from './admin-analytics-query.dto';

/**
 * Same pipe options as `admin-analytics.controller.ts`; query strings arrive
 * as strings, so this mirrors what a real request goes through.
 */
describe('Admin analytics query DTOs', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  function meta(metatype: new () => object): ArgumentMetadata {
    return { type: 'query', metatype, data: '' };
  }

  async function messagesOf(promise: Promise<unknown>): Promise<string[]> {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      return response.message;
    }
    throw new Error('expected a BadRequestException');
  }

  it('accepts a valid top-products query and converts limit to a number (AC11)', async () => {
    const result = (await pipe.transform(
      { from: '2026-09-01', to: '2026-09-30', source: 'simulator', eventType: 'TRY_ON', limit: '10' },
      meta(TopProductsQueryDto),
    )) as TopProductsQueryDto;

    expect(result).toBeInstanceOf(TopProductsQueryDto);
    expect(result).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      source: 'simulator',
      eventType: 'TRY_ON',
      limit: 10,
    });
  });

  it('rejects limit=100 with the Vietnamese message (AC11)', async () => {
    const messages = await messagesOf(
      pipe.transform({ limit: '100' }, meta(TopProductsQueryDto)),
    );

    expect(messages).toEqual(['limit tối đa là 50']);
  });

  it('rejects an unknown source with the Vietnamese message (AC11)', async () => {
    const messages = await messagesOf(
      pipe.transform({ source: 'fake' }, meta(AnalyticsEventsQueryDto)),
    );

    expect(messages).toEqual(['source chỉ được là real, simulator hoặc all']);
  });
});
