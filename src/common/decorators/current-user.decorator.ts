import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../auth/types/auth-user.interface';

export function currentUserFactory(
  _data: unknown,
  ctx: ExecutionContext,
): AuthUser {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return request.user;
}

export const CurrentUser = createParamDecorator(currentUserFactory);
