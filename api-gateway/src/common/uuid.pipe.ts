import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/**
 * `ParseUUIDPipe` with a Vietnamese 400 message. Every id path param that is
 * built into a downstream URL goes through it, so a value such as
 * `..%2F..%2Fadmin` is rejected at the edge instead of reaching another
 * upstream endpoint.
 */
export const UuidPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('Mã định danh không hợp lệ (phải là UUID)'),
});
