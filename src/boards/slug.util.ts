import { randomUUID } from 'node:crypto';

const DIACRITICS = /[̀-ͯ]/g;

function slugifyBase(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return base || 'board';
}

/** Slug único y legible: base derivada del título + sufijo aleatorio corto. */
export function generateSlug(title: string): string {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 6);
  return `${slugifyBase(title)}-${suffix}`;
}
