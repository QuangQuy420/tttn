import { BadRequestException, PipeTransform } from '@nestjs/common';

/**
 * 400 unless a non-UUID path param fully matches `pattern`. `encodeURIComponent`
 * leaves `.` as is and axios collapses `..` segments, so params like a slug or
 * a date must be validated at the edge before they are built into an
 * upstream URL.
 */
export class PatternPipe implements PipeTransform<unknown, string> {
  constructor(private readonly pattern: RegExp) {}

  transform(value: unknown): string {
    if (typeof value !== 'string' || !this.pattern.test(value)) {
      throw new BadRequestException('Tham số đường dẫn không hợp lệ');
    }
    return value;
  }
}

/** product-service slugs: lower-case words joined by `-` (plus an optional `-N` suffix). */
export const SlugPipe = new PatternPipe(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);

/** ISO date `YYYY-MM-DD` (saga-log day). */
export const IsoDatePipe = new PatternPipe(/^\d{4}-\d{2}-\d{2}$/);
