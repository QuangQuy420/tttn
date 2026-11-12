import { BadRequestException } from '@nestjs/common';
import { RequiredFilePipe } from './file-upload';

describe('RequiredFilePipe', () => {
  it('rejects an upload without a file part with 400 and a Vietnamese message (AC2)', async () => {
    const result = RequiredFilePipe.transform(undefined);

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('Thiếu tệp tải lên (trường "file")');
  });
});
