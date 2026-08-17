import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  JwtRefreshStrategy,
  extractRefreshCookie,
} from './jwt-refresh.strategy';

describe('extractRefreshCookie', () => {
  it('devuelve el valor de la cookie cf_rt', () => {
    const req = { cookies: { cf_rt: 'raw-token' } } as unknown as Request;
    expect(extractRefreshCookie(req)).toBe('raw-token');
  });

  it('devuelve null si no hay cookie cf_rt', () => {
    const req = { cookies: {} } as unknown as Request;
    expect(extractRefreshCookie(req)).toBeNull();
  });

  it('devuelve null si no hay objeto de cookies', () => {
    const req = {} as unknown as Request;
    expect(extractRefreshCookie(req)).toBeNull();
  });
});

describe('JwtRefreshStrategy', () => {
  let strategy: JwtRefreshStrategy;

  beforeEach(() => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('b'.repeat(32)),
    } as unknown as ConfigService;
    strategy = new JwtRefreshStrategy(config);
  });

  it('adjunta el token crudo de la cookie al payload validado', () => {
    const req = { cookies: { cf_rt: 'raw-token-value' } } as unknown as Request;

    const result = strategy.validate(req, {
      sub: 'u1',
      jti: 't1',
      familyId: 'f1',
      iat: 0,
      exp: 0,
    });

    expect(result).toEqual({
      sub: 'u1',
      jti: 't1',
      familyId: 'f1',
      iat: 0,
      exp: 0,
      rawToken: 'raw-token-value',
    });
  });
});
