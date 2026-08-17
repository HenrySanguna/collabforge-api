import { WsException } from '@nestjs/websockets';
import type { DataSource, Repository } from 'typeorm';
import { VotesService } from './votes.service';
import { Vote } from './entities/vote.entity';
import { Board } from '../boards/entities/board.entity';
import { BoardMember } from '../boards/entities/board-member.entity';

function aMember(overrides: Partial<BoardMember> = {}): BoardMember {
  return {
    id: 'member-1',
    boardId: 'board-1',
    userId: 'user-1',
    role: 'member',
    voteBudget: 3,
    ...overrides,
  } as BoardMember;
}

function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    allowMultiVote: false,
    ...overrides,
  } as Board;
}

async function expectWsError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    fail('expected rejection');
  } catch (err) {
    expect(err).toBeInstanceOf(WsException);
    expect((err as WsException).getError()).toMatchObject({ code });
  }
}

describe('VotesService', () => {
  let service: VotesService;
  let votesRepo: { createQueryBuilder: jest.Mock };
  let manager: {
    findOne: jest.Mock;
    count: jest.Mock;
    findOneByOrFail: jest.Mock;
    insert: jest.Mock;
    delete: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  function aQueryBuilder(rows: { noteId: string; count: string }[]) {
    return {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
  }

  beforeEach(() => {
    manager = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findOneByOrFail: jest.fn().mockResolvedValue(aBoard()),
      insert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      transaction: jest.fn((_isolation: string, cb: (m: unknown) => unknown) =>
        cb(manager),
      ),
    };
    votesRepo = { createQueryBuilder: jest.fn() };

    service = new VotesService(
      votesRepo as unknown as Repository<Vote>,
      dataSource as unknown as DataSource,
    );
  });

  describe('cast', () => {
    it('rechaza con NOT_A_MEMBER si no hay membresía', async () => {
      manager.findOne.mockResolvedValue(null);
      await expectWsError(
        service.cast('board-1', 'note-1', 'user-1'),
        'NOT_A_MEMBER',
      );
    });

    it('rechaza con BUDGET_EXCEEDED cuando el presupuesto está agotado', async () => {
      manager.findOne.mockResolvedValue(aMember({ voteBudget: 3 }));
      manager.count.mockResolvedValue(3);
      await expectWsError(
        service.cast('board-1', 'note-1', 'user-1'),
        'BUDGET_EXCEEDED',
      );
    });

    it('rechaza con ALREADY_VOTED cuando allowMultiVote es false y ya existe voto', async () => {
      manager.findOne.mockResolvedValue(aMember({ voteBudget: 3 }));
      manager.count
        .mockResolvedValueOnce(1) // spent
        .mockResolvedValueOnce(1); // votesOnNote
      manager.findOneByOrFail.mockResolvedValue(
        aBoard({ allowMultiVote: false }),
      );

      await expectWsError(
        service.cast('board-1', 'note-1', 'user-1'),
        'ALREADY_VOTED',
      );
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('permite votar de nuevo la misma nota cuando allowMultiVote es true', async () => {
      manager.findOne.mockResolvedValue(aMember({ voteBudget: 3 }));
      manager.count
        .mockResolvedValueOnce(1) // spent
        .mockResolvedValueOnce(1); // votesOnNote
      manager.findOneByOrFail.mockResolvedValue(
        aBoard({ allowMultiVote: true }),
      );

      const result = await service.cast('board-1', 'note-1', 'user-1');

      expect(manager.insert).toHaveBeenCalledWith(Vote, {
        boardId: 'board-1',
        noteId: 'note-1',
        userId: 'user-1',
      });
      expect(result).toEqual({ remaining: 1, count: 2 });
    });

    it('inserta el voto y devuelve remaining/count en el camino feliz', async () => {
      manager.findOne.mockResolvedValue(aMember({ voteBudget: 3 }));
      manager.count
        .mockResolvedValueOnce(0) // spent
        .mockResolvedValueOnce(0); // votesOnNote
      manager.findOneByOrFail.mockResolvedValue(
        aBoard({ allowMultiVote: false }),
      );

      const result = await service.cast('board-1', 'note-1', 'user-1');

      expect(manager.insert).toHaveBeenCalledWith(Vote, {
        boardId: 'board-1',
        noteId: 'note-1',
        userId: 'user-1',
      });
      expect(result).toEqual({ remaining: 2, count: 1 });
    });
  });

  describe('retract', () => {
    it('rechaza con NOT_A_MEMBER si no hay membresía', async () => {
      manager.findOne.mockResolvedValueOnce(null);
      await expectWsError(
        service.retract('board-1', 'note-1', 'user-1'),
        'NOT_A_MEMBER',
      );
    });

    it('es un no-op si no hay voto que retirar', async () => {
      manager.findOne
        .mockResolvedValueOnce(aMember({ voteBudget: 3 }))
        .mockResolvedValueOnce(null);
      manager.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const result = await service.retract('board-1', 'note-1', 'user-1');

      expect(manager.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ remaining: 2, count: 0 });
    });

    it('elimina el voto existente y recalcula remaining/count', async () => {
      manager.findOne
        .mockResolvedValueOnce(aMember({ voteBudget: 3 }))
        .mockResolvedValueOnce({ id: 'vote-1' });
      manager.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      const result = await service.retract('board-1', 'note-1', 'user-1');

      expect(manager.delete).toHaveBeenCalledWith(Vote, { id: 'vote-1' });
      expect(result).toEqual({ remaining: 3, count: 0 });
    });
  });

  describe('tally', () => {
    it('agrega el conteo de votos por nota en todo el tablero', async () => {
      const qb = aQueryBuilder([
        { noteId: 'note-1', count: '2' },
        { noteId: 'note-2', count: '1' },
      ]);
      votesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.tally('board-1');

      expect(qb.where).toHaveBeenCalledWith('v.board_id = :boardId', {
        boardId: 'board-1',
      });
      expect(result).toEqual({ 'note-1': 2, 'note-2': 1 });
    });

    it('devuelve {} cuando no hay votos', async () => {
      const qb = aQueryBuilder([]);
      votesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.tally('board-1');

      expect(result).toEqual({});
    });
  });

  describe('myVotes', () => {
    it('agrega el conteo de votos propios por nota', async () => {
      const qb = aQueryBuilder([{ noteId: 'note-1', count: '3' }]);
      votesRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.myVotes('board-1', 'user-1');

      expect(qb.andWhere).toHaveBeenCalledWith('v.user_id = :userId', {
        userId: 'user-1',
      });
      expect(result).toEqual({ 'note-1': 3 });
    });
  });
});
