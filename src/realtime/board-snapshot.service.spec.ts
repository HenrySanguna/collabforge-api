import type { Repository } from 'typeorm';
import { BoardSnapshotService } from './board-snapshot.service';
import { BoardsService } from '../boards/boards.service';
import { NotesService } from '../notes/notes.service';
import { NoteSerializerService } from '../notes/note-serializer.service';
import { VotesService } from '../votes/votes.service';
import { PresenceService } from './presence.service';
import { BoardColumn } from '../boards/entities/board-column.entity';
import { Board } from '../boards/entities/board.entity';
import { Note } from '../notes/entities/note.entity';
import type { ParticipantDto } from '../contracts';

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
  let presence: { list: jest.Mock };
  let votes: { myVotes: jest.Mock; tally: jest.Mock };

  beforeEach(() => {
    columnsRepo = { find: jest.fn().mockResolvedValue([]) };
    boards = { findByIdOrFail: jest.fn().mockResolvedValue(aBoard()) };
    notes = { findAllForBoard: jest.fn().mockResolvedValue([]) };
    serializer = { forViewer: jest.fn() };
    presence = { list: jest.fn().mockReturnValue([]) };
    votes = {
      myVotes: jest.fn().mockResolvedValue({}),
      tally: jest.fn().mockResolvedValue({}),
    };

    service = new BoardSnapshotService(
      columnsRepo as unknown as Repository<BoardColumn>,
      boards as unknown as BoardsService,
      notes as unknown as NotesService,
      serializer as unknown as NoteSerializerService,
      presence as unknown as PresenceService,
      votes as unknown as VotesService,
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

  it('usa la lista de presencia del tablero para participants', async () => {
    const participants: ParticipantDto[] = [
      {
        userId: 'user-2',
        name: 'Bruno',
        avatarColor: '#abcdef',
        role: 'member',
        isOnline: true,
      },
    ];
    presence.list.mockReturnValue(participants);

    const snapshot = await service.build('board-1', 'user-2', 'member');

    expect(presence.list).toHaveBeenCalledWith('board-1');
    expect(snapshot.participants).toBe(participants);
  });

  it('serializa timerEndsAt como ISO string o null', async () => {
    boards.findByIdOrFail.mockResolvedValue(
      aBoard({ timerEndsAt: new Date('2026-01-01T00:00:00Z') }),
    );

    const snapshot = await service.build('board-1', 'user-1', 'owner');

    expect(snapshot.board.timerEndsAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('incluye myVotes del observador siempre', async () => {
    votes.myVotes.mockResolvedValue({ 'note-1': 2 });

    const snapshot = await service.build('board-1', 'user-2', 'member');

    expect(votes.myVotes).toHaveBeenCalledWith('board-1', 'user-2');
    expect(snapshot.myVotes).toEqual({ 'note-1': 2 });
  });

  it('tally es null cuando el tablero no está revelado ni tiene liveTally', async () => {
    boards.findByIdOrFail.mockResolvedValue(
      aBoard({ revealed: false, liveTally: false }),
    );

    const snapshot = await service.build('board-1', 'user-1', 'member');

    expect(votes.tally).not.toHaveBeenCalled();
    expect(snapshot.tally).toBeNull();
  });

  it('tally se calcula cuando el tablero está revelado', async () => {
    boards.findByIdOrFail.mockResolvedValue(
      aBoard({ revealed: true, liveTally: false }),
    );
    votes.tally.mockResolvedValue({ 'note-1': 5 });

    const snapshot = await service.build('board-1', 'user-1', 'member');

    expect(votes.tally).toHaveBeenCalledWith('board-1');
    expect(snapshot.tally).toEqual({ 'note-1': 5 });
  });

  it('tally se calcula cuando liveTally está activo aunque no esté revelado', async () => {
    boards.findByIdOrFail.mockResolvedValue(
      aBoard({ revealed: false, liveTally: true }),
    );
    votes.tally.mockResolvedValue({ 'note-1': 1 });

    const snapshot = await service.build('board-1', 'user-1', 'member');

    expect(votes.tally).toHaveBeenCalledWith('board-1');
    expect(snapshot.tally).toEqual({ 'note-1': 1 });
  });
});
