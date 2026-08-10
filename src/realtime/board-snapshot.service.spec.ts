import type { Repository } from 'typeorm';
import { BoardSnapshotService } from './board-snapshot.service';
import { BoardsService } from '../boards/boards.service';
import { NotesService } from '../notes/notes.service';
import { NoteSerializerService } from '../notes/note-serializer.service';
import { BoardColumn } from '../boards/entities/board-column.entity';
import { Board } from '../boards/entities/board.entity';
import { Note } from '../notes/entities/note.entity';

function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    slug: 'retro-abc',
    title: 'Retro',
    phase: 'COLLECTING',
    revealed: false,
    voteBudget: 3,
    allowMultiVote: false,
    liveTally: false,
    timerEndsAt: null,
    isArchived: false,
    ownerId: 'user-1',
    ...overrides,
  } as Board;
}

describe('BoardSnapshotService', () => {
  let service: BoardSnapshotService;
  let columnsRepo: { find: jest.Mock };
  let boards: { findByIdOrFail: jest.Mock };
  let notes: { findAllForBoard: jest.Mock };
  let serializer: { forViewer: jest.Mock };

  beforeEach(() => {
    columnsRepo = { find: jest.fn().mockResolvedValue([]) };
    boards = { findByIdOrFail: jest.fn().mockResolvedValue(aBoard()) };
    notes = { findAllForBoard: jest.fn().mockResolvedValue([]) };
    serializer = { forViewer: jest.fn() };

    service = new BoardSnapshotService(
      columnsRepo as unknown as Repository<BoardColumn>,
      boards as unknown as BoardsService,
      notes as unknown as NotesService,
      serializer as unknown as NoteSerializerService,
    );
  });

  it('arma el snapshot con columnas, notas proyectadas y serverTime', async () => {
    columnsRepo.find.mockResolvedValue([
      { id: 'c1', title: 'Start', color: '#fff', position: 0 },
    ]);
    const rawNote = { id: 'n1' } as Note;
    notes.findAllForBoard.mockResolvedValue([rawNote]);
    serializer.forViewer.mockReturnValue({ id: 'n1', author: null });

    const snapshot = await service.build('board-1', 'user-2', 'member');

    expect(snapshot.board).toMatchObject({ id: 'board-1', slug: 'retro-abc' });
    expect(snapshot.columns).toEqual([
      { id: 'c1', title: 'Start', color: '#fff', position: 0 },
    ]);
    expect(snapshot.notes).toEqual([{ id: 'n1', author: null }]);
    expect(snapshot.myRole).toBe('member');
    expect(serializer.forViewer).toHaveBeenCalledWith(
      rawNote,
      expect.objectContaining({ id: 'board-1' }),
      'user-2',
      'member',
    );
    expect(typeof snapshot.serverTime).toBe('string');
  });

  it('serializa timerEndsAt como ISO string o null', async () => {
    boards.findByIdOrFail.mockResolvedValue(
      aBoard({ timerEndsAt: new Date('2026-01-01T00:00:00Z') }),
    );

    const snapshot = await service.build('board-1', 'user-1', 'owner');

    expect(snapshot.board.timerEndsAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
