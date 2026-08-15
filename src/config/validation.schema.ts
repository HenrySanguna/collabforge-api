import { z } from 'zod';

export const validationSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  INVITE_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string(),
  REDIS_URL: z.url().optional(),
  METRICS_TOKEN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof validationSchema>;

export function validate(config: Record<string, unknown>): EnvConfig {
  const result = validationSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${result.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return result.data;
}
