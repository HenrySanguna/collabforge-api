import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { BoardsService } from './boards.service';
import { MembersService } from './members.service';
import { Board } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { BoardMember } from './entities/board-member.entity';

function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    slug: 'retro-42-abcdef',
    title: 'Retro 42',
    ownerId: 'user-1',
    phase: 'COLLECTING',
    revealed: false,
    voteBudget: 3,
    allowMultiVote: false,
    liveTally: false,
    timerEndsAt: null,
    isArchived: false,
    inviteTokenId: null,
    inviteExpiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    columns: [],
    members: [],
    ...overrides,
  } as Board;
}

describe('BoardsService', () => {
  let service: BoardsService;
  let boardsRepo: {
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    save: jest.Mock;
    manager: unknown;
  };
  let membersRepo: { findAndCount: jest.Mock };
  let membersService: { requireMembership: jest.Mock };
  let manager: {
    save: jest.Mock;
    insert: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    manager = {
      save: jest.fn(async (_entity: unknown, value: unknown) => ({
        id: 'board-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...(value as object),
      })),
      insert: jest.fn().mockResolvedValue({
        identifiers: [{ id: 'col-1' }, { id: 'col-2' }, { id: 'col-3' }],
      }),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      find: jest.fn().mockResolvedValue([]),
    };
    dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    };

    boardsRepo = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(async (b: Board) => b),
      manager: { find: jest.fn().mockResolvedValue([]) },
    };
    membersRepo = { findAndCount: jest.fn() };
    membersService = { requireMembership: jest.fn() };

    service = new BoardsService(
      boardsRepo as unknown as Repository<Board>,
      membersRepo as unknown as Repository<BoardMember>,
      dataSource as unknown as DataSource,
      membersService as unknown as MembersService,
    );
  });

  describe('create', () => {
    it('crea el tablero con las columnas de la plantilla y al creador como owner', async () => {
      const result = await service.create('user-1', {
        title: 'Retro 42',
        templateKey: 'START_STOP_CONTINUE',
      });

      expect(manager.insert).toHaveBeenCalledWith(
        BoardColumn,
        expect.arrayContaining([expect.objectContaining({ title: 'Start' })]),
      );
      expect(manager.insert).toHaveBeenCalledWith(
        BoardMember,
        expect.objectContaining({ userId: 'user-1', role: 'owner' }),
      );
      expect(result.myRole).toBe('owner');
      expect(result.columns).toHaveLength(3);
      expect(result.columns[0]).toEqual(
        expect.objectContaining({ id: 'col-1', title: 'Start', position: 0 }),
      );
    });

    it('ordena las columnas devueltas por posición', async () => {
      const result = await service.create('user-1', {
        title: 'X',
        templateKey: 'BLANK',
      });
      const positions = result.columns.map((c) => c.position);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });
  });

  describe('listForUser', () => {
    it('pagina y ordena por última actividad del tablero', async () => {
      membersRepo.findAndCount.mockResolvedValue([
        [{ role: 'owner', board: aBoard() }],
        1,
      ]);

      const result = await service.listForUser('user-1', 2, 10);

      expect(membersRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          order: { board: { updatedAt: 'DESC' } },
          skip: 10,
          take: 10,
        }),
      );
      expect(result).toEqual({
        items: [expect.objectContaining({ id: 'board-1', myRole: 'owner' })],
        page: 2,
        limit: 10,
        total: 1,
      });
    });
  });

  describe('findBySlugForUser', () => {
    it('devuelve el detalle cuando el usuario es miembro', async () => {
      boardsRepo.findOne.mockResolvedValue(aBoard({ columns: [] }));
      membersService.requireMembership.mockResolvedValue({ role: 'member' });

      const result = await service.findBySlugForUser(
        'retro-42-abcdef',
        'user-2',
      );

      expect(result.myRole).toBe('member');
    });

    it('lanza NotFoundException si el slug no existe', async () => {
      boardsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findBySlugForUser('no-existe', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propaga el rechazo si el usuario no es miembro', async () => {
      boardsRepo.findOne.mockResolvedValue(aBoard());
      membersService.requireMembership.mockRejectedValue(
        new ForbiddenException(),
      );

      await expect(
        service.findBySlugForUser('retro-42-abcdef', 'user-x'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('requireOwner', () => {
    it('resuelve cuando el usuario es el owner', async () => {
      boardsRepo.findOneBy.mockResolvedValue(aBoard({ ownerId: 'user-1' }));
      await expect(
        service.requireOwner('board-1', 'user-1'),
      ).resolves.toMatchObject({
        ownerId: 'user-1',
      });
    });

    it('rechaza cuando el usuario no es el owner', async () => {
      boardsRepo.findOneBy.mockResolvedValue(aBoard({ ownerId: 'user-1' }));
      await expect(
        service.requireOwner('board-1', 'user-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lanza NotFoundException si el tablero no existe', async () => {
      boardsRepo.findOneBy.mockResolvedValue(null);
      await expect(
        service.requireOwner('no-existe', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('archive', () => {
    it('marca el tablero como archivado', async () => {
      boardsRepo.findOneBy.mockResolvedValue(
        aBoard({ ownerId: 'user-1', isArchived: false }),
      );

      const result = await service.archive('board-1', 'user-1');

      expect(boardsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isArchived: true }),
      );
      expect(result.isArchived).toBe(true);
    });
  });
});
