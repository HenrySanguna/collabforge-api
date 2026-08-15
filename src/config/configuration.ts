import type { EnvConfig } from './validation.schema';

export default function configuration(): EnvConfig {
  return {
    NODE_ENV: process.env.NODE_ENV as EnvConfig['NODE_ENV'],
    PORT: Number(process.env.PORT ?? 3000),
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
    JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL ?? '15m',
    JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL ?? '7d',
    INVITE_SECRET: process.env.INVITE_SECRET!,
    CORS_ORIGINS: process.env.CORS_ORIGINS!,
    REDIS_URL: process.env.REDIS_URL,
    METRICS_TOKEN: process.env.METRICS_TOKEN,
  };
}
