import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { BoardsService } from '../../boards/boards.service';
import { PHASES_KEY } from '../decorators/allowed-phases.decorator';
import type { BoardPhase } from '../../contracts';
import type { AuthenticatedSocket } from '../types/authenticated-socket.interface';

@Injectable()
export class PhaseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly boards: BoardsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const allowed = this.reflector.get<BoardPhase[] | undefined>(
      PHASES_KEY,
      ctx.getHandler(),
    );
    if (!allowed) return true;

    const client = ctx.switchToWs().getClient<AuthenticatedSocket>();
    const board = await this.boards.findByIdOrFail(client.data.boardId!);

    if (!allowed.includes(board.phase)) {
      throw new WsException({
        code: 'PHASE_NOT_ALLOWED',
        message: `This action is not allowed in phase ${board.phase}.`,
        meta: { currentPhase: board.phase },
      });
    }
    return true;
  }
}
