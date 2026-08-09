import type { ExecutionContext } from '@nestjs/common';
import { currentUserFactory } from './current-user.decorator';

describe('currentUserFactory', () => {
  it('extrae el usuario adjuntado a la request por el guard', () => {
    const user = { id: 'u1', email: 'ana@test.com', name: 'Ana' };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(currentUserFactory(undefined, ctx)).toBe(user);
  });
});
