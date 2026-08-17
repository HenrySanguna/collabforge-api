import { WsException } from '@nestjs/websockets';
import type { Repository } from 'typeorm';
import { NotesService } from './notes.service';
import { BoardsService } from '../boards/boards.service';
import { NoteSerializerService } from './note-serializer.service';
import { Note } from './entities/note.entity';
import { Board } from '../boards/entities/board.entity';

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

function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    isArchived: false,
    phase: 'COLLECTING',
    revealed: false,
    ...overrides,
  } as Board;
}

async function expectWsError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(WsException);
  try {
    await promise;
    fail('expected rejection');
  } catch (err) {
    expect((err as WsException).getError()).toMatchObject({ code });
  }
}

describe('NotesService', () => {
  let service: NotesService;
  let notesRepo: {
    find: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let boards: { findByIdOrFail: jest.Mock };
  let serializer: { forAuthor: jest.Mock };

  beforeEach(() => {
    notesRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((value: object) => ({ ...value }) as Note),
      save: jest.fn(async (note: Note) => note),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    boards = { findByIdOrFail: jest.fn().mockResolvedValue(aBoard()) };
    serializer = { forAuthor: jest.fn().mockReturnValue({ id: 'note-1' }) };

    service = new NotesService(
      notesRepo as unknown as Repository<Note>,
      boards as unknown as BoardsService,
      serializer as unknown as NoteSerializerService,
    );
  });

  describe('create', () => {
    it('rechaza si el tablero está archivado', async () => {
      boards.findByIdOrFail.mockResolvedValue(aBoard({ isArchived: true }));
      await expectWsError(
        service.create('board-1', 'user-1', { columnId: 'col-1', text: 'x' }),
        'BOARD_ARCHIVED',
      );
    });

    it('rechaza al alcanzar el límite de notas', async () => {
      notesRepo.count.mockResolvedValue(500);
      await expectWsError(
        service.create('board-1', 'user-1', { columnId: 'col-1', text: 'x' }),
        'BOARD_LIMIT_REACHED',
      );
    });

    it('posiciona la nota al final de la columna', async () => {
      notesRepo.find
        .mockResolvedValueOnce([aNote({ position: 5 })])
        .mockResolvedValueOnce([aNote()]);
      notesRepo.findOne.mockResolvedValue(aNote({ position: 6 }));

      await service.create('board-1', 'user-1', {
        columnId: 'col-1',
        text: 'Nueva',
      });

      expect(notesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 6 }),
      );
    });
  });

  describe('update', () => {
    it('rechaza si el usuario no es el autor', async () => {
      notesRepo.findOne.mockResolvedValue(aNote({ authorId: 'user-2' }));
      await expectWsError(
        service.update('board-1', 'user-1', {
          noteId: 'note-1',
          text: 'x',
          version: 1,
        }),
        'FORBIDDEN_ROLE',
      );
    });

    it('rechaza con VERSION_CONFLICT si la versión no coincide', async () => {
      notesRepo.findOne.mockResolvedValue(aNote({ version: 3 }));
      await expectWsError(
        service.update('board-1', 'user-1', {
          noteId: 'note-1',
          text: 'x',
          version: 1,
        }),
        'VERSION_CONFLICT',
      );
    });

    it('actualiza el texto cuando todo es válido', async () => {
      notesRepo.findOne
        .mockResolvedValueOnce(aNote({ version: 1 }))
        .mockResolvedValueOnce(aNote({ version: 2, text: 'Editada' }));

      const result = await service.update('board-1', 'user-1', {
        noteId: 'note-1',
        text: 'Editada',
        version: 1,
      });

      expect(notesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Editada' }),
      );
      expect(result.text).toBe('Editada');
    });
  });

  describe('move', () => {
    it('rechaza con VERSION_CONFLICT si la versión no coincide', async () => {
      notesRepo.findOne.mockResolvedValue(aNote({ version: 3 }));
      await expectWsError(
        service.move('board-1', {
          noteId: 'note-1',
          columnId: 'col-2',
          position: 2,
          version: 1,
        }),
        'VERSION_CONFLICT',
      );
    });

    it('mueve la nota a la columna y posición indicadas', async () => {
      notesRepo.findOne
        .mockResolvedValueOnce(aNote({ version: 1 }))
        .mockResolvedValueOnce(aNote({ version: 2, columnId: 'col-2' }));

      await service.move('board-1', {
        noteId: 'note-1',
        columnId: 'col-2',
        position: 2,
        version: 1,
      });

      expect(notesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ columnId: 'col-2', position: 2 }),
      );
    });
  });

  describe('remove', () => {
    it('permite borrar al autor', async () => {
      notesRepo.findOne.mockResolvedValue(aNote({ authorId: 'user-1' }));
      await service.remove('board-1', 'user-1', 'member', 'note-1');
      expect(notesRepo.remove).toHaveBeenCalled();
    });

    it('permite borrar al owner aunque no sea el autor', async () => {
      notesRepo.findOne.mockResolvedValue(aNote({ authorId: 'user-2' }));
      await service.remove('board-1', 'user-1', 'owner', 'note-1');
      expect(notesRepo.remove).toHaveBeenCalled();
    });

    it('rechaza a un miembro que no es autor ni owner', async () => {
      notesRepo.findOne.mockResolvedValue(aNote({ authorId: 'user-2' }));
      await expectWsError(
        service.remove('board-1', 'user-1', 'member', 'note-1'),
        'FORBIDDEN_ROLE',
      );
    });

    it('lanza NOTE_NOT_FOUND si la nota no pertenece al tablero', async () => {
      notesRepo.findOne.mockResolvedValue(aNote({ boardId: 'other-board' }));
      await expectWsError(
        service.remove('board-1', 'user-1', 'owner', 'note-1'),
        'NOTE_NOT_FOUND',
      );
    });
  });
});
