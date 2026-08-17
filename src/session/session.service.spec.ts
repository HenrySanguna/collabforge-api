import { WsException } from '@nestjs/websockets';
import { SessionService } from './session.service';
import { BoardsService } from '../boards/boards.service';
import { MembersService } from '../boards/members.service';
import { Board, BoardPhase } from '../boards/entities/board.entity';

function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    ownerId: 'user-1',
    phase: 'COLLECTING',
    revealed: false,
    timerEndsAt: null,
    timerPaused: false,
    timerRemainingMs: null,
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

describe('SessionService', () => {
  let service: SessionService;
  let boards: { requireOwner: jest.Mock; save: jest.Mock };
  let members: { remove: jest.Mock };

  beforeEach(() => {
    boards = {
      requireOwner: jest.fn(),
      save: jest.fn(async (b: Board) => b),
    };
    members = { remove: jest.fn().mockResolvedValue(undefined) };

    service = new SessionService(
      boards as unknown as BoardsService,
      members as unknown as MembersService,
    );
  });

  describe('changePhase — tabla exhaustiva de transiciones', () => {
    const PHASES: BoardPhase[] = [
      'COLLECTING',
      'GROUPING',
      'VOTING',
      'DISCUSSING',
    ];
    const VALID: Record<BoardPhase, BoardPhase[]> = {
      COLLECTING: ['GROUPING'],
      GROUPING: ['COLLECTING', 'VOTING'],
      VOTING: ['GROUPING', 'DISCUSSING'],
      DISCUSSING: ['VOTING'],
    };

    const cases: Array<{ from: BoardPhase; to: BoardPhase; valid: boolean }> =
      [];
    for (const from of PHASES) {
      for (const to of PHASES) {
        if (from === to) continue;
        cases.push({ from, to, valid: VALID[from].includes(to) });
      }
    }

    it.each(cases)('$from → $to es $valid', async ({ from, to, valid }) => {
      boards.requireOwner.mockResolvedValue(aBoard({ phase: from }));

      if (valid) {
        const board = await service.changePhase('board-1', 'user-1', to);
        expect(board.phase).toBe(to);
      } else {
        await expectWsError(
          service.changePhase('board-1', 'user-1', to),
          'INVALID_TRANSITION',
        );
      }
    });

    it('tiene exactamente 12 pares ordenados sin contar auto-transiciones', () => {
      expect(cases).toHaveLength(12);
    });

    it('entrar en DISCUSSING revela el tablero automáticamente', async () => {
      boards.requireOwner.mockResolvedValue(aBoard({ phase: 'VOTING' }));
      const board = await service.changePhase(
        'board-1',
        'user-1',
        'DISCUSSING',
      );
      expect(board.revealed).toBe(true);
    });

    it('no revela el tablero en una transición que no sea a DISCUSSING', async () => {
      boards.requireOwner.mockResolvedValue(aBoard({ phase: 'COLLECTING' }));
      const board = await service.changePhase('board-1', 'user-1', 'GROUPING');
      expect(board.revealed).toBe(false);
    });

    it('incluye from/to en el meta del error', async () => {
      boards.requireOwner.mockResolvedValue(aBoard({ phase: 'COLLECTING' }));
      try {
        await service.changePhase('board-1', 'user-1', 'DISCUSSING');
        fail('expected rejection');
      } catch (err) {
        expect((err as WsException).getError()).toMatchObject({
          code: 'INVALID_TRANSITION',
          meta: { from: 'COLLECTING', to: 'DISCUSSING' },
        });
      }
    });
  });

  describe('startTimer', () => {
    it('fija timerEndsAt en el futuro y limpia el estado de pausa', async () => {
      boards.requireOwner.mockResolvedValue(
        aBoard({ timerPaused: true, timerRemainingMs: 5000 }),
      );

      const before = Date.now();
      const result = await service.startTimer('board-1', 'user-1', 60);
      const endsAt = new Date(result.endsAt).getTime();

      expect(endsAt).toBeGreaterThanOrEqual(before + 60_000);
      expect(boards.save).toHaveBeenCalledWith(
        expect.objectContaining({ timerPaused: false, timerRemainingMs: null }),
      );
    });
  });

  describe('pauseTimer', () => {
    it('congela el tiempo restante y limpia timerEndsAt', async () => {
      const endsAt = new Date(Date.now() + 30_000);
      boards.requireOwner.mockResolvedValue(aBoard({ timerEndsAt: endsAt }));

      const result = await service.pauseTimer('board-1', 'user-1');

      expect(result.paused).toBe(true);
      expect(result.endsAt).toBeNull();
      expect(result.remainingMs).toBeGreaterThan(0);
      expect(boards.save).toHaveBeenCalledWith(
        expect.objectContaining({ timerPaused: true, timerEndsAt: null }),
      );
    });

    it('es un no-op si no hay temporizador activo', async () => {
      boards.requireOwner.mockResolvedValue(aBoard({ timerEndsAt: null }));

      const result = await service.pauseTimer('board-1', 'user-1');

      expect(result).toEqual({
        endsAt: null,
        paused: false,
        remainingMs: undefined,
      });
      expect(boards.save).not.toHaveBeenCalled();
    });

    it('es un no-op si ya estaba en pausa', async () => {
      boards.requireOwner.mockResolvedValue(
        aBoard({
          timerEndsAt: new Date(Date.now() + 10_000),
          timerPaused: true,
          timerRemainingMs: 4000,
        }),
      );

      const result = await service.pauseTimer('board-1', 'user-1');

      expect(result).toEqual({ endsAt: null, paused: true, remainingMs: 4000 });
      expect(boards.save).not.toHaveBeenCalled();
    });
  });

  describe('cancelTimer', () => {
    it('limpia por completo el estado del temporizador', async () => {
      boards.requireOwner.mockResolvedValue(
        aBoard({
          timerEndsAt: new Date(),
          timerPaused: true,
          timerRemainingMs: 1000,
        }),
      );

      const result = await service.cancelTimer('board-1', 'user-1');

      expect(result).toEqual({ endsAt: null, paused: false });
      expect(boards.save).toHaveBeenCalledWith(
        expect.objectContaining({
          timerEndsAt: null,
          timerPaused: false,
          timerRemainingMs: null,
        }),
      );
    });
  });

  describe('reveal', () => {
    it('marca el tablero como revelado', async () => {
      boards.requireOwner.mockResolvedValue(aBoard({ revealed: false }));
      const board = await service.reveal('board-1', 'user-1');
      expect(board.revealed).toBe(true);
    });
  });

  describe('kick', () => {
    it('rechaza que el owner se expulse a sí mismo', async () => {
      boards.requireOwner.mockResolvedValue(aBoard({ ownerId: 'user-1' }));
      await expectWsError(
        service.kick('board-1', 'user-1', 'user-1'),
        'FORBIDDEN_ROLE',
      );
      expect(members.remove).not.toHaveBeenCalled();
    });

    it('elimina la membresía del usuario expulsado', async () => {
      boards.requireOwner.mockResolvedValue(aBoard({ ownerId: 'user-1' }));
      await service.kick('board-1', 'user-1', 'user-2');
      expect(members.remove).toHaveBeenCalledWith('board-1', 'user-2');
    });

    it('propaga el rechazo si quien llama no es el owner', async () => {
      boards.requireOwner.mockRejectedValue(
        new WsException({ code: 'FORBIDDEN_ROLE', message: 'nope' }),
      );
      await expectWsError(
        service.kick('board-1', 'user-2', 'user-3'),
        'FORBIDDEN_ROLE',
      );
      expect(members.remove).not.toHaveBeenCalled();
    });
  });
});
