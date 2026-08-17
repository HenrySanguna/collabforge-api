import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RefreshPayload } from './decorators/refresh-payload.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { durationToMs } from './token-duration.util';
import type { AuthUser } from './types/auth-user.interface';
import type { AuthSession } from './types/auth-session.interface';
import type { RefreshTokenRequestPayload } from './strategies/jwt-refresh.strategy';

const REFRESH_COOKIE = 'cf_rt';
const REFRESH_COOKIE_PATH = '/api/auth/refresh';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(dto);
    return this.respondWithSession(res, session);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto);
    return this.respondWithSession(res, session);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @RefreshPayload() payload: RefreshTokenRequestPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.refresh(payload);
    return this.respondWithSession(res, session);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = res.req.cookies as
      Record<string, string | undefined> | undefined;
    const rawToken = cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      try {
        const payload = await this.jwt.verifyAsync<{ jti: string }>(rawToken, {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        });
        await this.auth.logout(payload.jti);
      } catch {
        // token ya inválido/expirado: logout es idempotente, no hay nada que revocar
      }
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  private respondWithSession(res: Response, session: AuthSession) {
    const isProduction = this.config.get('NODE_ENV') === 'production';
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      // 'none' es obligatorio para que el navegador reenvíe la cookie en la
      // petición cross-site desde el frontend (dominio distinto al de la API);
      // requiere secure:true, por eso va ligado a isProduction. En local
      // (mismo sitio, distinto puerto) 'lax' basta y no exige secure.
      sameSite: isProduction ? 'none' : 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: durationToMs(this.config.getOrThrow<string>('JWT_REFRESH_TTL')),
    });
    return { accessToken: session.accessToken, user: session.user };
  }
}
