import { durationToMs } from './token-duration.util';

describe('durationToMs', () => {
  it('convierte segundos', () => {
    expect(durationToMs('30s')).toBe(30_000);
  });

  it('convierte minutos', () => {
    expect(durationToMs('15m')).toBe(15 * 60_000);
  });

  it('convierte horas', () => {
    expect(durationToMs('2h')).toBe(2 * 60 * 60_000);
  });

  it('convierte días', () => {
    expect(durationToMs('7d')).toBe(7 * 24 * 60 * 60_000);
  });

  it('rechaza un formato inválido', () => {
    expect(() => durationToMs('7')).toThrow();
    expect(() => durationToMs('7x')).toThrow();
    expect(() => durationToMs('abc')).toThrow();
  });
});
