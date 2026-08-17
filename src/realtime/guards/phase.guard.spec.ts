import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { PhaseGuard } from './phase.guard';
import type { BoardsService } from '../../boards/boards.service';

function aContext(boardId: string): ExecutionContext {
  const client = { data: { boardId } };
  return {
    switchToWs: () => ({ getClient: () => client }),
    getHandler: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('PhaseGuard', () => {
  let guard: PhaseGuard;
  let reflector: { get: jest.Mock };
  let boards: { findByIdOrFail: jest.Mock };

  beforeEach(() => {
    reflector = { get: jest.fn() };
    boards = { findByIdOrFail: jest.fn() };
    guard = new PhaseGuard(
      reflector as unknown as Reflector,
      boards as unknown as BoardsService,
    );
  });

  it('permite el paso si el handler no declara fases permitidas', async () => {
    reflector.get.mockReturnValue(undefined);
    await expect(guard.canActivate(aContext('board-1'))).resolves.toBe(true);
    expect(boards.findByIdOrFail).not.toHaveBeenCalled();
  });

  it('permite el paso si la fase actual está en la lista', async () => {
    reflector.get.mockReturnValue(['COLLECTING']);
    boards.findByIdOrFail.mockResolvedValue({ phase: 'COLLECTING' });

    await expect(guard.canActivate(aContext('board-1'))).resolves.toBe(true);
  });

  it('rechaza con PHASE_NOT_ALLOWED si la fase no está permitida', async () => {
    reflector.get.mockReturnValue(['COLLECTING']);
    boards.findByIdOrFail.mockResolvedValue({ phase: 'VOTING' });

    await expect(guard.canActivate(aContext('board-1'))).rejects.toBeInstanceOf(
      WsException,
    );
  });
});
