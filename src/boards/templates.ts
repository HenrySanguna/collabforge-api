export interface BoardTemplateColumn {
  title: string;
  color: string;
  position: number;
}

export interface BoardTemplate {
  label: string;
  columns: BoardTemplateColumn[];
}

export const BOARD_TEMPLATES = {
  START_STOP_CONTINUE: {
    label: 'Start / Stop / Continue',
    columns: [
      { title: 'Start', color: '#86efac', position: 0 },
      { title: 'Stop', color: '#fca5a5', position: 1 },
      { title: 'Continue', color: '#fde68a', position: 2 },
    ],
  },
  MAD_SAD_GLAD: {
    label: 'Mad / Sad / Glad',
    columns: [
      { title: 'Mad', color: '#fca5a5', position: 0 },
      { title: 'Sad', color: '#93c5fd', position: 1 },
      { title: 'Glad', color: '#86efac', position: 2 },
    ],
  },
  FOUR_L: {
    label: '4L (Liked / Learned / Lacked / Longed for)',
    columns: [
      { title: 'Liked', color: '#86efac', position: 0 },
      { title: 'Learned', color: '#93c5fd', position: 1 },
      { title: 'Lacked', color: '#fca5a5', position: 2 },
      { title: 'Longed for', color: '#d8b4fe', position: 3 },
    ],
  },
  BLANK: {
    label: 'En blanco',
    columns: [{ title: 'Ideas', color: '#bfdbfe', position: 0 }],
  },
} as const satisfies Record<string, BoardTemplate>;

export type BoardTemplateKey = keyof typeof BOARD_TEMPLATES;
