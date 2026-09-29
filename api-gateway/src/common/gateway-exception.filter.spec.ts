import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { GatewayExceptionFilter } from './gateway-exception.filter';

describe('GatewayExceptionFilter', () => {
  let filter: GatewayExceptionFilter;
  let response: { status: jest.Mock; json: jest.Mock };
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new GatewayExceptionFilter();
    response = { status: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response);
    host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
  });

  it('wraps a gateway UnauthorizedException into an UNAUTHORIZED envelope', () => {
    filter.catch(new UnauthorizedException('Token không hợp lệ'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: 'Token không hợp lệ',
      error: { code: 'UNAUTHORIZED', details: null },
    });
  });

  it('passes an upstream error envelope through unchanged', () => {
    const upstream = {
      success: false,
      message: 'Giỏ hàng đã thay đổi',
      error: { code: 'CART_CHANGED', details: { variantIds: ['v1'] } },
    };

    filter.catch(new HttpException(upstream, HttpStatus.CONFLICT), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(upstream);
  });
});
