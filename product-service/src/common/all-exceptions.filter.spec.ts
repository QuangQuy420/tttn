import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps NotFoundException to a 404 NOT_FOUND envelope (AC2)', () => {
    const { host, status, json } = makeHost();

    filter.catch(new NotFoundException('Không tìm thấy sản phẩm.'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Không tìm thấy sản phẩm.',
      error: { code: 'NOT_FOUND', details: null },
    });
  });

  it('maps ValidationPipe array messages to a 400 VALIDATION_FAILED envelope (AC4)', () => {
    const { host, status, json } = makeHost();
    const messages = [
      'page must not be less than 1',
      'limit must not be greater than 100',
    ];

    filter.catch(new BadRequestException(messages), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'page must not be less than 1',
      error: { code: 'VALIDATION_FAILED', details: messages },
    });
  });
});
