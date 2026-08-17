import { BOARD_TEMPLATES } from './templates';
import type { BoardTemplate } from './templates';

const entries = Object.entries(BOARD_TEMPLATES) as [string, BoardTemplate][];

describe('BOARD_TEMPLATES', () => {
  it.each(entries)(
    '%s tiene al menos una columna con posiciones únicas',
    (_key, template) => {
      expect(template.columns.length).toBeGreaterThan(0);
      const positions = template.columns.map((c) => c.position);
      expect(new Set(positions).size).toBe(positions.length);
    },
  );

  it.each(entries)(
    '%s: cada columna tiene título y color válidos',
    (_key, template) => {
      for (const column of template.columns) {
        expect(column.title.length).toBeGreaterThan(0);
        expect(column.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    },
  );

  it('BLANK tiene exactamente una columna', () => {
    expect(BOARD_TEMPLATES.BLANK.columns).toHaveLength(1);
  });

  it('START_STOP_CONTINUE tiene exactamente tres columnas', () => {
    expect(BOARD_TEMPLATES.START_STOP_CONTINUE.columns).toHaveLength(3);
  });
});
