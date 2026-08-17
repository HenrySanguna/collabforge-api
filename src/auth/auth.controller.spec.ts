import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function mockResponse(cookies?: Record<string, string>): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    req: { cookies },
  } as unknown as Response;
}

describe('AuthController', () => {
  let controller: AuthController;
  let auth: jest.Mocked<
    Pick<AuthService, 'register' | 'login' | 'refresh' | 'logout'>
  >;
  let jwt: jest.Mocked<Pick<JwtService, 'verifyAsync'>>;
  let config: Record<string, string>;

  const session = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: { id: 'u1', email: 'ana@test.com', name: 'Ana' },
  };

  beforeEach(() => {
    config = {
      NODE_ENV: 'test',
      JWT_REFRESH_TTL: '7d',
      JWT_REFRESH_SECRET: 'b'.repeat(32),
    };
    auth = {
      register: jest.fn().mockResolvedValue(session),
      login: jest.fn().mockResolvedValue(session),
      refresh: jest.fn().mockResolvedValue(session),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    jwt = { verifyAsync: jest.fn() };

    const configService = {
      get: jest.fn((key: string) => config[key]),
      getOrThrow: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;

    controller = new AuthController(
      auth as unknown as AuthService,
      configService,
      jwt as unknown as JwtService,
    );
  });

  it('register: fija la cookie httpOnly con el path acotado y devuelve el access token', async () => {
    const res = mockResponse();

    const body = await controller.register(
      { email: 'ana@test.com', password: 'Password123', name: 'Ana' },
      res,
    );

    expect(body).toEqual({ accessToken: 'access-token', user: session.user });
    expect(res.cookie).toHaveBeenCalledWith(
      'cf_rt',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/auth/refresh',
      }),
    );
  });

  it('register: secure=false y sameSite=lax fuera de producción', async () => {
    const res = mockResponse();
    await controller.register(
      { email: 'a@test.com', password: 'Password123', name: 'A' },
      res,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'cf_rt',
      expect.anything(),
      expect.objectContaining({ secure: false, sameSite: 'lax' }),
    );
  });

  it('register: secure=true y sameSite=none en producción', async () => {
    config.NODE_ENV = 'production';
    const res = mockResponse();
    await controller.register(
      { email: 'a@test.com', password: 'Password123', name: 'A' },
      res,
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'cf_rt',
      expect.anything(),
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });

  it('login: delega en AuthService.login', async () => {
    const res = mockResponse();
    await controller.login({ email: 'ana@test.com', password: 'x' }, res);
    expect(auth.login).toHaveBeenCalledWith({
      email: 'ana@test.com',
      password: 'x',
    });
  });

  it('refresh: delega en AuthService.refresh con el payload del guard', async () => {
    const res = mockResponse();
    const payload = {
      sub: 'u1',
      jti: 't1',
      familyId: 'f1',
      iat: 0,
      exp: 0,
      rawToken: 'raw',
    };
    await controller.refresh(payload, res);
    expect(auth.refresh).toHaveBeenCalledWith(payload);
  });

  it('logout: revoca el refresh token cuando la cookie es válida y limpia la cookie', async () => {
    const res = mockResponse({ cf_rt: 'valid-refresh-token' });
    jwt.verifyAsync.mockResolvedValue({ jti: 'jti-1' });

    await controller.logout(res);

    expect(auth.logout).toHaveBeenCalledWith('jti-1');
    expect(res.clearCookie).toHaveBeenCalledWith('cf_rt', {
      path: '/api/auth/refresh',
    });
  });

  it('logout: es idempotente si la cookie ya es inválida/expirada', async () => {
    const res = mockResponse({ cf_rt: 'expired-token' });
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await controller.logout(res);

    expect(auth.logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith('cf_rt', {
      path: '/api/auth/refresh',
    });
  });

  it('logout: no falla si no hay cookie de refresh', async () => {
    const res = mockResponse();
    await controller.logout(res);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('me: devuelve el usuario inyectado por el guard', () => {
    const user = { id: 'u1', email: 'ana@test.com', name: 'Ana' };
    expect(controller.me(user)).toBe(user);
  });
});
