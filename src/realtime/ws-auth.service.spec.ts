import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { WsAuthService } from './ws-auth.service';
import type { UsersService } from '../users/users.service';

describe('WsAuthService', () => {
  let service: WsAuthService;
  let jwt: { verifyAsync: jest.Mock };
  let users: { findActiveById: jest.Mock };

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    users = { findActiveById: jest.fn() };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('a'.repeat(32)),
    } as unknown as ConfigService;

    service = new WsAuthService(
      jwt as unknown as JwtService,
      config,
      users as unknown as UsersService,
    );
  });

  it('rechaza cuando no hay token', async () => {
    await expect(service.verify(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza cuando el usuario del payload ya no está activo', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    users.findActiveById.mockResolvedValue(null);

    await expect(service.verify('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('devuelve el usuario cuando el token es válido', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    users.findActiveById.mockResolvedValue({
      id: 'u1',
      email: 'ana@test.com',
      name: 'Ana',
    });

    const result = await service.verify('token');

    expect(result).toEqual({ id: 'u1', email: 'ana@test.com', name: 'Ana' });
  });
});
