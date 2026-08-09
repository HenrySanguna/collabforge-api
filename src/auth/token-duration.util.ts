const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Convierte '15m' / '7d' / '30s' en milisegundos. */
export function durationToMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) throw new Error(`Invalid duration format: ${value}`);
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
