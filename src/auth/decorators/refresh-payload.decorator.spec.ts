import type { ExecutionContext } from '@nestjs/common';
import { refreshPayloadFactory } from './refresh-payload.decorator';

describe('refreshPayloadFactory', () => {
  it('extrae el payload de refresh adjuntado por el guard', () => {
    const payload = {
      sub: 'u1',
      jti: 't1',
      familyId: 'f1',
      iat: 0,
      exp: 0,
      rawToken: 'raw',
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: payload }) }),
    } as unknown as ExecutionContext;

    expect(refreshPayloadFactory(undefined, ctx)).toBe(payload);
  });
});
