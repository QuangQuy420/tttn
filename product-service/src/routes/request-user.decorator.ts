import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { isUUID } from 'class-validator';

const DEFAULT_USER_NAME = 'Người dùng';
const MAX_USER_NAME_LENGTH = 100;

/**
 * The caller's user id from the `X-User-Id` header set by api-gateway after JWT checks
 * (product-service has no auth of its own). Missing/invalid → 401.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const userId = context
      .switchToHttp()
      .getRequest<Request>()
      .header('x-user-id');
    if (!userId || !isUUID(userId)) {
      throw new UnauthorizedException('Bạn cần đăng nhập');
    }
    return userId;
  },
);

/** The caller's display name from `X-User-Name` (JWT username), with a generic fallback. */
export const CurrentUserName = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const userName = context
      .switchToHttp()
      .getRequest<Request>()
      .header('x-user-name')
      ?.trim();
    return userName
      ? userName.slice(0, MAX_USER_NAME_LENGTH)
      : DEFAULT_USER_NAME;
  },
);
