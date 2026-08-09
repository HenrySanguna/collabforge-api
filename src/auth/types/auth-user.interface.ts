export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  familyId: string;
  iat: number;
  exp: number;
}
