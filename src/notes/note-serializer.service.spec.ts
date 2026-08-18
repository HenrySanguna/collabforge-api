import { NoteSerializerService } from './note-serializer.service';
import { Board } from '../boards/entities/board.entity';
import { Note } from './entities/note.entity';

function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    phase: 'COLLECTING',
    revealed: false,
    ...overrides,
  } as Board;
}

function aNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    boardId: 'board-1',
    columnId: 'col-1',
    authorId: 'user-1',
    text: 'Hello',
    position: 1,
    groupId: null,
    version: 1,
    isDiscussed: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    author: { id: 'user-1', name: 'Ana', avatarColor: '#abcdef' },
    ...overrides,
  } as Note;
}

describe('NoteSerializerService', () => {
  const serializer = new NoteSerializerService();

  describe('forOthers', () => {
    it('oculta la autoría en COLLECTING sin revelar', () => {
      const dto = serializer.forOthers(aNote(), aBoard());
      expect(dto.author).toBeNull();
    });

    it('muestra la autoría cuando el tablero fue revelado', () => {
      const dto = serializer.forOthers(aNote(), aBoard({ revealed: true }));
      expect(dto.author).toEqual({
        userId: 'user-1',
        name: 'Ana',
        avatarColor: '#abcdef',
      });
    });

    it('sigue ocultando la autoría en GROUPING y VOTING mientras no esté revelada', () => {
      expect(
        serializer.forOthers(aNote(), aBoard({ phase: 'GROUPING' })).author,
      ).toBeNull();
      expect(
        serializer.forOthers(aNote(), aBoard({ phase: 'VOTING' })).author,
      ).toBeNull();
    });

    it('muestra la autoría en GROUPING y VOTING una vez revelada', () => {
      expect(
        serializer.forOthers(aNote(), aBoard({ phase: 'GROUPING', revealed: true }))
          .author,
      ).not.toBeNull();
      expect(
        serializer.forOthers(aNote(), aBoard({ phase: 'VOTING', revealed: true }))
          .author,
      ).not.toBeNull();
    });

    it('siempre muestra la autoría en DISCUSSING, revelado o no', () => {
      expect(
        serializer.forOthers(aNote(), aBoard({ phase: 'DISCUSSING', revealed: false }))
          .author,
      ).not.toBeNull();
    });
  });

  describe('forAuthor / forOwner', () => {
    it('siempre incluyen la autoría', () => {
      expect(serializer.forAuthor(aNote()).author).not.toBeNull();
      expect(serializer.forOwner(aNote()).author).not.toBeNull();
    });
  });

  describe('forViewer', () => {
    it('el propio autor siempre ve su autoría', () => {
      const dto = serializer.forViewer(aNote(), aBoard(), 'user-1', 'member');
      expect(dto.author).not.toBeNull();
    });

    it('el owner siempre ve la autoría de terceros', () => {
      const dto = serializer.forViewer(aNote(), aBoard(), 'user-2', 'owner');
      expect(dto.author).not.toBeNull();
    });

    it('un miembro cualquiera respeta la ocultación', () => {
      const dto = serializer.forViewer(aNote(), aBoard(), 'user-2', 'member');
      expect(dto.author).toBeNull();
    });
  });
});
