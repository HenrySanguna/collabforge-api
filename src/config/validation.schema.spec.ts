import { validate } from './validation.schema';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://cf:cf@localhost:5432/collabforge',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  INVITE_SECRET: 'c'.repeat(32),
  CORS_ORIGINS: 'http://localhost:4200',
};

describe('validate', () => {
  it('acepta una configuración completa y aplica los valores por defecto', () => {
    const config = validate(validEnv);

    expect(config.PORT).toBe(3000);
    expect(config.JWT_ACCESS_TTL).toBe('15m');
    expect(config.JWT_REFRESH_TTL).toBe('7d');
  });

  it('rechaza el arranque si falta un secreto', () => {
    const withoutAccessSecret = { ...validEnv, JWT_ACCESS_SECRET: undefined };
    expect(() => validate(withoutAccessSecret)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rechaza un secreto de menos de 32 caracteres', () => {
    expect(() =>
      validate({ ...validEnv, JWT_ACCESS_SECRET: 'demasiado_corto' }),
    ).toThrow();
  });

  it('rechaza una DATABASE_URL que no es una URL válida', () => {
    expect(() =>
      validate({ ...validEnv, DATABASE_URL: 'no-es-una-url' }),
    ).toThrow();
  });

  it('METRICS_TOKEN es opcional y queda undefined si no se define', () => {
    const config = validate(validEnv);

    expect(config.METRICS_TOKEN).toBeUndefined();
  });

  it('acepta METRICS_TOKEN cuando se define', () => {
    const config = validate({ ...validEnv, METRICS_TOKEN: 'secret-token' });

    expect(config.METRICS_TOKEN).toBe('secret-token');
  });
});
