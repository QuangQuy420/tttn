import { BadRequestException } from '@nestjs/common';
import { UuidPipe } from './uuid.pipe';

describe('UuidPipe', () => {
  const metadata = { type: 'param' as const, data: 'id' };

  it('rejects a path-traversal id with 400 and a Vietnamese message (AC1)', async () => {
    // Express has already decoded `%2F` by the time the pipe runs.
    const result = UuidPipe.transform('../../admin/orders/summary', metadata);

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('Mã định danh không hợp lệ (phải là UUID)');
  });
});
