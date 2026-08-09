import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RefreshTokenRequestPayload } from '../strategies/jwt-refresh.strategy';

export function refreshPayloadFactory(
  _data: unknown,
  ctx: ExecutionContext,
): RefreshTokenRequestPayload {
  const request = ctx
    .switchToHttp()
    .getRequest<Request & { user: RefreshTokenRequestPayload }>();
  return request.user;
}

export const RefreshPayload = createParamDecorator(refreshPayloadFactory);
