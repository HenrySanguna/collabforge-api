import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { BoardsService } from '../boards/boards.service';
import { MembersService } from '../boards/members.service';
import { Board } from '../boards/entities/board.entity';
import type { BoardPhase } from '../contracts';

const TRANSITIONS: Record<BoardPhase, BoardPhase[]> = {
  COLLECTING: ['GROUPING'],
  GROUPING: ['COLLECTING', 'VOTING'],
  VOTING: ['GROUPING', 'DISCUSSING'],
  DISCUSSING: ['VOTING'],
};

export interface TimerState {
  endsAt: string | null;
  paused: boolean;
  remainingMs?: number;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly boards: BoardsService,
    private readonly members: MembersService,
  ) {}

  async changePhase(
    boardId: string,
    userId: string,
    next: BoardPhase,
  ): Promise<Board> {
    const board = await this.boards.requireOwner(boardId, userId);

    if (!TRANSITIONS[board.phase].includes(next)) {
      throw new WsException({
        code: 'INVALID_TRANSITION',
        message: `Cannot move from ${board.phase} to ${next}.`,
        meta: { from: board.phase, to: next },
      });
    }

    board.phase = next;
    // Entering DISCUSSING always reveals authorship and votes automatically.
    if (next === 'DISCUSSING') board.revealed = true;

    return this.boards.save(board);
  }

  async startTimer(
    boardId: string,
    userId: string,
    durationSeconds: number,
  ): Promise<{ endsAt: string }> {
    const board = await this.boards.requireOwner(boardId, userId);
    const endsAt = new Date(Date.now() + durationSeconds * 1000);
    board.timerEndsAt = endsAt;
    board.timerPaused = false;
    board.timerRemainingMs = null;
    await this.boards.save(board);
    return { endsAt: endsAt.toISOString() };
  }

  // Timers are absolute `timerEndsAt` timestamps with no server-side ticking (clients
  // correct for drift via `serverTime`). Pausing has nothing to freeze, so it converts
  // the absolute deadline into a stashed remaining-ms duration and clears `timerEndsAt`;
  // there is no `resume` event in the protocol, so a paused timer stays frozen until the
  // owner issues a brand new `session:start-timer`.
  async pauseTimer(boardId: string, userId: string): Promise<TimerState> {
    const board = await this.boards.requireOwner(boardId, userId);

    if (!board.timerEndsAt || board.timerPaused) {
      return {
        endsAt: null,
        paused: board.timerPaused,
        remainingMs: board.timerRemainingMs ?? undefined,
      };
    }

    const remainingMs = Math.max(0, board.timerEndsAt.getTime() - Date.now());
    board.timerPaused = true;
    board.timerRemainingMs = remainingMs;
    board.timerEndsAt = null;
    await this.boards.save(board);

    return { endsAt: null, paused: true, remainingMs };
  }

  async cancelTimer(boardId: string, userId: string): Promise<TimerState> {
    const board = await this.boards.requireOwner(boardId, userId);
    board.timerEndsAt = null;
    board.timerPaused = false;
    board.timerRemainingMs = null;
    await this.boards.save(board);
    return { endsAt: null, paused: false };
  }

  async reveal(boardId: string, userId: string): Promise<Board> {
    const board = await this.boards.requireOwner(boardId, userId);
    board.revealed = true;
    return this.boards.save(board);
  }

  async kick(
    boardId: string,
    ownerId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.boards.requireOwner(boardId, ownerId);
    if (ownerId === targetUserId) {
      throw new WsException({
        code: 'FORBIDDEN_ROLE',
        message: 'The owner cannot kick themselves.',
      });
    }
    await this.members.remove(boardId, targetUserId);
  }
}
