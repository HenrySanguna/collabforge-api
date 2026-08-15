import { WsException } from '@nestjs/websockets';
import type { Repository } from 'typeorm';
import { ActionItemsService, toActionItemDto } from './action-items.service';
import { ActionItem } from './entities/action-item.entity';
import { Board } from '../boards/entities/board.entity';

function anItem(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'item-1',
    boardId: 'board-1',
    text: 'Follow up with design',
    assigneeId: null,
    status: 'open',
    createdBy: 'owner-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as ActionItem;
}

function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    ownerId: 'owner-1',
    phase: 'DISCUSSING',
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

describe('ActionItemsService', () => {
  let service: ActionItemsService;
  let repo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let boards: { findByIdOrFail: jest.Mock };

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value: object) => ({ ...value }) as ActionItem),
      save: jest.fn(async (item: ActionItem) => item),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    boards = { findByIdOrFail: jest.fn().mockResolvedValue(aBoard()) };

    service = new ActionItemsService(
      repo as unknown as Repository<ActionItem>,
      boards as unknown as import('../boards/boards.service').BoardsService,
    );
  });

  describe('create', () => {
    it('rechaza con FORBIDDEN_ROLE cuando el caller no es el owner', async () => {
      boards.findByIdOrFail.mockResolvedValue(aBoard({ ownerId: 'owner-1' }));
      await expectWsError(
        service.create('board-1', 'member-2', { text: 'Nueva tarea' }),
        'FORBIDDEN_ROLE',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza con PHASE_NOT_ALLOWED fuera de DISCUSSING', async () => {
      boards.findByIdOrFail.mockResolvedValue(
        aBoard({ ownerId: 'owner-1', phase: 'VOTING' }),
      );
      await expectWsError(
        service.create('board-1', 'owner-1', { text: 'Nueva tarea' }),
        'PHASE_NOT_ALLOWED',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('crea el action item cuando el owner actúa en DISCUSSING', async () => {
      boards.findByIdOrFail.mockResolvedValue(
        aBoard({ ownerId: 'owner-1', phase: 'DISCUSSING' }),
      );
      const created = await service.create('board-1', 'owner-1', {
        text: 'Nueva tarea',
        assigneeId: 'user-9',
      });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          boardId: 'board-1',
          text: 'Nueva tarea',
          assigneeId: 'user-9',
          createdBy: 'owner-1',
          status: 'open',
        }),
      );
      expect(created.text).toBe('Nueva tarea');
    });

    it('usa assigneeId null cuando no se provee ninguno', async () => {
      boards.findByIdOrFail.mockResolvedValue(
        aBoard({ ownerId: 'owner-1', phase: 'DISCUSSING' }),
      );
      await service.create('board-1', 'owner-1', { text: 'Sin asignar' });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: null }),
      );
    });
  });

  describe('update', () => {
    it('rechaza con ACTION_ITEM_NOT_FOUND si no existe en el board', async () => {
      repo.findOne.mockResolvedValue(null);
      await expectWsError(
        service.update('board-1', 'owner-1', { id: 'missing' }),
        'ACTION_ITEM_NOT_FOUND',
      );
    });

    it('rechaza con ACTION_ITEM_NOT_FOUND si el item pertenece a otro board', async () => {
      repo.findOne.mockResolvedValue(anItem({ boardId: 'other-board' }));
      await expectWsError(
        service.update('board-1', 'owner-1', { id: 'item-1' }),
        'ACTION_ITEM_NOT_FOUND',
      );
    });

    it('actualiza status cuando el owner actúa en DISCUSSING', async () => {
      repo.findOne.mockResolvedValue(anItem());
      const updated = await service.update('board-1', 'owner-1', {
        id: 'item-1',
        status: 'done',
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'item-1', status: 'done' }),
      );
      expect(updated.status).toBe('done');
    });

    it('actualiza text y assigneeId dejando status intacto', async () => {
      repo.findOne.mockResolvedValue(anItem({ status: 'open' }));
      const updated = await service.update('board-1', 'owner-1', {
        id: 'item-1',
        text: 'Texto editado',
        assigneeId: 'user-7',
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Texto editado',
          assigneeId: 'user-7',
          status: 'open',
        }),
      );
      expect(updated.text).toBe('Texto editado');
    });
  });

  describe('remove', () => {
    it('elimina el action item existente', async () => {
      repo.findOne.mockResolvedValue(anItem());
      await service.remove('board-1', 'owner-1', 'item-1');
      expect(repo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'item-1' }),
      );
    });
  });

  describe('findAllForBoard', () => {
    it('devuelve la lista persistida para el board', async () => {
      repo.find.mockResolvedValue([anItem(), anItem({ id: 'item-2' })]);
      const items = await service.findAllForBoard('board-1');
      expect(items).toHaveLength(2);
      expect(repo.find).toHaveBeenCalledWith({
        where: { boardId: 'board-1' },
        order: { createdAt: 'ASC' },
      });
    });
  });
});

describe('toActionItemDto', () => {
  it('mapea la entidad al DTO con status y createdAt ISO', () => {
    const dto = toActionItemDto(anItem({ status: 'done' }));
    expect(dto).toEqual({
      id: 'item-1',
      text: 'Follow up with design',
      assigneeId: null,
      status: 'done',
      createdBy: 'owner-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('preserva assigneeId cuando está presente', () => {
    const dto = toActionItemDto(anItem({ assigneeId: 'user-9' }));
    expect(dto.assigneeId).toBe('user-9');
  });
});
