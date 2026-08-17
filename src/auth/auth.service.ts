import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { avatarColorFor } from './avatar-color.util';
import { durationToMs } from './token-duration.util';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { AuthSession } from './types/auth-session.interface';
import type { AuthUser } from './types/auth-user.interface';
import type { RefreshTokenRequestPayload } from './strategies/jwt-refresh.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSession> {
    if (await this.users.existsByEmail(dto.email)) {
      throw new ConflictException({
        code: 'REGISTRATION_FAILED',
        message: 'No se pudo completar el registro con estos datos.',
      });
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      avatarColor: avatarColorFor(dto.email),
    });

    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email o contraseña incorrectos.',
      });
    }
    return this.issueSession(user);
  }

  async refresh(payload: RefreshTokenRequestPayload): Promise<AuthSession> {
    const stored = await this.refreshTokens.findOne({
      where: { id: payload.jti },
      relations: { user: true },
    });

    if (!stored) throw new UnauthorizedException();

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      this.logger.warn(
        { userId: stored.userId, familyId: stored.familyId },
        'refresh_token_reuse_detected',
      );
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: 'Session revoked',
      });
    }

    if (!(await argon2.verify(stored.tokenHash, payload.rawToken))) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException();
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.update(
        RefreshToken,
        { id: stored.id },
        { revokedAt: new Date() },
      );
      const accessToken = await this.issueAccessToken(stored.user);
      const refreshToken = await this.issueRefreshToken(
        manager,
        stored.user,
        stored.familyId,
      );
      return { accessToken, refreshToken, user: toAuthUser(stored.user) };
    });
  }

  async logout(jti: string): Promise<void> {
    await this.refreshTokens.update({ id: jti }, { revokedAt: new Date() });
  }

  private async issueSession(user: User): Promise<AuthSession> {
    return this.dataSource.transaction(async (manager) => {
      const familyId = randomUUID();
      const accessToken = await this.issueAccessToken(user);
      const refreshToken = await this.issueRefreshToken(
        manager,
        user,
        familyId,
      );
      return { accessToken, refreshToken, user: toAuthUser(user) };
    });
  }

  private issueAccessToken(user: User): Promise<string> {
    const jti = randomUUID();
    const ttl = this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, jti },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: Math.floor(durationToMs(ttl) / 1000),
      },
    );
  }

  private async issueRefreshToken(
    manager: EntityManager,
    user: User,
    familyId: string,
  ): Promise<string> {
    const jti = randomUUID();
    const ttl = this.config.getOrThrow<string>('JWT_REFRESH_TTL');
    const expiresAt = new Date(Date.now() + durationToMs(ttl));

    const token = await this.jwt.signAsync(
      { sub: user.id, jti, familyId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: Math.floor(durationToMs(ttl) / 1000),
      },
    );

    await manager.insert(RefreshToken, {
      id: jti,
      userId: user.id,
      familyId,
      tokenHash: await argon2.hash(token),
      expiresAt,
    });

    return token;
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update({ familyId }, { revokedAt: new Date() });
  }
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, name: user.name };
}
