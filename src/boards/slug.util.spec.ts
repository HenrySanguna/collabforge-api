import { generateSlug } from './slug.util';

describe('generateSlug', () => {
  it('convierte el título a minúsculas y separa por guiones', () => {
    const slug = generateSlug('Retro Sprint 42');
    expect(slug).toMatch(/^retro-sprint-42-[0-9a-f]{6}$/);
  });

  it('elimina acentos y diacríticos', () => {
    const slug = generateSlug('Sesión de Planificación');
    expect(slug.startsWith('sesion-de-planificacion-')).toBe(true);
  });

  it('genera sufijos distintos para el mismo título', () => {
    const a = generateSlug('Retro');
    const b = generateSlug('Retro');
    expect(a).not.toBe(b);
  });

  it('usa "board" como base cuando el título no aporta caracteres válidos', () => {
    const slug = generateSlug('!!!');
    expect(slug.startsWith('board-')).toBe(true);
  });

  it('nunca supera los 40 caracteres del campo slug', () => {
    const slug = generateSlug(
      'Un título extremadamente largo para forzar el truncado del slug',
    );
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});
