import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  it('maps NotFoundException to a NOT_FOUND error envelope', () => {
    const response = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(
      new NotFoundException('Không tìm thấy thanh toán'),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: 'Không tìm thấy thanh toán',
      error: { code: 'NOT_FOUND', details: null },
    });
  });
});
