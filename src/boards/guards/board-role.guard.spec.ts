import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { BoardRoleGuard } from './board-role.guard';

describe('BoardRoleGuard', () => {
  function contextWith(membership?: { role: string }): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ membership }) }),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('permite el paso si no hay rol requerido en el handler', () => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) };
    const guard = new BoardRoleGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(contextWith({ role: 'member' }))).toBe(true);
  });

  it('permite el paso cuando el rol de la membresía coincide', () => {
    const reflector = { get: jest.fn().mockReturnValue('owner') };
    const guard = new BoardRoleGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(contextWith({ role: 'owner' }))).toBe(true);
  });

  it('rechaza con FORBIDDEN_ROLE cuando el rol no coincide', () => {
    const reflector = { get: jest.fn().mockReturnValue('owner') };
    const guard = new BoardRoleGuard(reflector as unknown as Reflector);

    expect(() => guard.canActivate(contextWith({ role: 'member' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza cuando no hay membresía adjunta a la request', () => {
    const reflector = { get: jest.fn().mockReturnValue('owner') };
    const guard = new BoardRoleGuard(reflector as unknown as Reflector);

    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
