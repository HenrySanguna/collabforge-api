import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { RefreshTokenPayload } from '../types/auth-user.interface';

export interface RefreshTokenRequestPayload extends RefreshTokenPayload {
  rawToken: string;
}

export function extractRefreshCookie(req: Request): string | null {
  return (req?.cookies?.cf_rt as string | undefined) ?? null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshCookie]),
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
      ignoreExpiration: false,
    });
  }

  validate(
    req: Request,
    payload: RefreshTokenPayload,
  ): RefreshTokenRequestPayload {
    return { ...payload, rawToken: req.cookies.cf_rt as string };
  }
}
