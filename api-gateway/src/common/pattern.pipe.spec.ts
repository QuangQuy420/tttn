import { BadRequestException } from '@nestjs/common';
import { IsoDatePipe, SlugPipe } from './pattern.pipe';

describe('PatternPipe', () => {
  it('SlugPipe and IsoDatePipe reject a `..` traversal with 400 and a Vietnamese message (AC1)', () => {
    // Express has already decoded `%2F` by the time the pipe runs.
    for (const pipe of [SlugPipe, IsoDatePipe]) {
      expect(() => pipe.transform('../../admin/orders/summary')).toThrow(BadRequestException);
      expect(() => pipe.transform('..')).toThrow('Tham số đường dẫn không hợp lệ');
    }
    // Valid values pass through unchanged.
    expect(SlugPipe.transform('aviator-classic-2')).toBe('aviator-classic-2');
    expect(IsoDatePipe.transform('2026-11-11')).toBe('2026-11-11');
  });
});
