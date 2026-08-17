import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAccessStrategy } from './jwt-access.strategy';
import { UsersService } from '../../users/users.service';

describe('JwtAccessStrategy', () => {
  let strategy: JwtAccessStrategy;
  let users: { findActiveById: jest.Mock };

  beforeEach(() => {
    users = { findActiveById: jest.fn() };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('a'.repeat(32)),
    } as unknown as ConfigService;

    strategy = new JwtAccessStrategy(config, users as unknown as UsersService);
  });

  it('devuelve el usuario cuando el payload referencia una cuenta activa', async () => {
    users.findActiveById.mockResolvedValue({
      id: 'u1',
      email: 'ana@test.com',
      name: 'Ana',
    });

    const result = await strategy.validate({
      sub: 'u1',
      email: 'ana@test.com',
      jti: 't1',
      iat: 0,
      exp: 0,
    });

    expect(result).toEqual({ id: 'u1', email: 'ana@test.com', name: 'Ana' });
  });

  it('rechaza el token si el usuario ya no está activo', async () => {
    users.findActiveById.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'ana@test.com',
        jti: 't1',
        iat: 0,
        exp: 0,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
