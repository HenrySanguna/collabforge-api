import { avatarColorFor } from './avatar-color.util';

describe('avatarColorFor', () => {
  it('es determinístico para el mismo texto', () => {
    expect(avatarColorFor('ana@test.com')).toBe(avatarColorFor('ana@test.com'));
  });

  it('produce colores distintos para textos distintos', () => {
    expect(avatarColorFor('ana@test.com')).not.toBe(
      avatarColorFor('bruno@test.com'),
    );
  });

  it('devuelve un hex de 7 caracteres', () => {
    expect(avatarColorFor('ana@test.com')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
