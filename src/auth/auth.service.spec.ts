import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

function aUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'ana@test.com',
    passwordHash: '',
    name: 'Ana',
    avatarColor: '#123456',
    isActive: true,
    createdAt: new Date(),
    refreshTokens: [],
    memberships: [],
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<UsersService, 'existsByEmail' | 'create' | 'findByEmail'>
  >;
  let refreshTokens: { findOne: jest.Mock; update: jest.Mock };
  let manager: { update: jest.Mock; insert: jest.Mock };
  let config: Record<string, string>;

  beforeEach(() => {
    config = {
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      NODE_ENV: 'test',
    };

    users = {
      existsByEmail: jest.fn().mockResolvedValue(false),
      create: jest.fn(),
      findByEmail: jest.fn(),
    };

    manager = { update: jest.fn(), insert: jest.fn() };
    refreshTokens = { findOne: jest.fn(), update: jest.fn() };

    const dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => unknown) => cb(manager)),
    } as unknown as DataSource;

    const configService = {
      get: jest.fn((key: string) => config[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = config[key];
        if (!value) throw new Error(`Missing config ${key}`);
        return value;
      }),
    } as unknown as ConfigService;

    const jwtService = new JwtService();

    service = new AuthService(
      users as unknown as UsersService,
      jwtService,
      configService,
      dataSource,
      refreshTokens as never,
    );
  });

  describe('register', () => {
    it('crea la sesión y nunca expone el hash de contraseña', async () => {
      users.create.mockImplementation(async (input) => aUser({ ...input }));

      const session = await service.register({
        email: 'ana@test.com',
        password: 'Password123',
        name: 'Ana',
      });

      expect(session.accessToken).toEqual(expect.any(String));
      expect(session.refreshToken).toEqual(expect.any(String));
      expect(session.user).toEqual({
        id: 'user-1',
        email: 'ana@test.com',
        name: 'Ana',
      });
      expect(
        (session.user as unknown as { passwordHash?: string }).passwordHash,
      ).toBeUndefined();
      expect(manager.insert).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('rechaza el registro si el email ya existe, sin crear el usuario', async () => {
      users.existsByEmail.mockResolvedValue(true);

      await expect(
        service.register({
          email: 'ana@test.com',
          password: 'Password123',
          name: 'Ana',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('autentica con credenciales válidas', async () => {
      const passwordHash = await argon2.hash('Password123');
      users.findByEmail.mockResolvedValue(aUser({ passwordHash }));

      const session = await service.login({
        email: 'ana@test.com',
        password: 'Password123',
      });

      expect(session.user.email).toBe('ana@test.com');
    });

    it('rechaza una contraseña incorrecta sin distinguir del caso "usuario inexistente"', async () => {
      const passwordHash = await argon2.hash('Password123');
      users.findByEmail.mockResolvedValue(aUser({ passwordHash }));

      await expect(
        service.login({ email: 'ana@test.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza un email que no existe', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nadie@test.com', password: 'Password123' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rota el token e invalida el anterior', async () => {
      const rawToken = 'raw-refresh-token';
      const tokenHash = await argon2.hash(rawToken);
      refreshTokens.findOne.mockResolvedValue({
        id: 'jti-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash,
        revokedAt: null,
        user: aUser(),
      });

      const session = await service.refresh({
        sub: 'user-1',
        jti: 'jti-1',
        familyId: 'family-1',
        iat: 0,
        exp: 0,
        rawToken,
      });

      expect(manager.update).toHaveBeenCalledWith(
        RefreshToken,
        { id: 'jti-1' },
        { revokedAt: expect.any(Date) },
      );
      expect(manager.insert).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({ familyId: 'family-1' }),
      );
      expect(session.accessToken).toEqual(expect.any(String));
    });

    it('revoca toda la familia al detectar reutilización de un token ya usado', async () => {
      refreshTokens.findOne.mockResolvedValue({
        id: 'jti-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'irrelevant',
        revokedAt: new Date(),
        user: aUser(),
      });

      await expect(
        service.refresh({
          sub: 'user-1',
          jti: 'jti-1',
          familyId: 'family-1',
          iat: 0,
          exp: 0,
          rawToken: 'raw',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(refreshTokens.update).toHaveBeenCalledWith(
        { familyId: 'family-1' },
        { revokedAt: expect.any(Date) },
      );
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('revoca la familia si el hash no coincide con el token recibido', async () => {
      const tokenHash = await argon2.hash('token-legitimo');
      refreshTokens.findOne.mockResolvedValue({
        id: 'jti-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash,
        revokedAt: null,
        user: aUser(),
      });

      await expect(
        service.refresh({
          sub: 'user-1',
          jti: 'jti-1',
          familyId: 'family-1',
          iat: 0,
          exp: 0,
          rawToken: 'token-manipulado',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(refreshTokens.update).toHaveBeenCalledWith(
        { familyId: 'family-1' },
        { revokedAt: expect.any(Date) },
      );
    });

    it('rechaza un jti inexistente', async () => {
      refreshTokens.findOne.mockResolvedValue(null);

      await expect(
        service.refresh({
          sub: 'user-1',
          jti: 'no-existe',
          familyId: 'family-1',
          iat: 0,
          exp: 0,
          rawToken: 'raw',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('marca el refresh token como revocado', async () => {
      await service.logout('jti-1');

      expect(refreshTokens.update).toHaveBeenCalledWith(
        { id: 'jti-1' },
        { revokedAt: expect.any(Date) },
      );
    });
  });
});
