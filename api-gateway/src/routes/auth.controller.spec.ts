import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const httpCodeOf = (handler: unknown): unknown =>
    Reflect.getMetadata(HTTP_CODE_METADATA, handler as object);

  it('answers 200 (not Nest default 201) on login, forgot-password and reset-password, like user-service (AC3)', () => {
    expect(httpCodeOf(AuthController.prototype.login)).toBe(HttpStatus.OK);
    expect(httpCodeOf(AuthController.prototype.forgotPassword)).toBe(HttpStatus.OK);
    expect(httpCodeOf(AuthController.prototype.resetPassword)).toBe(HttpStatus.OK);
  });
});
