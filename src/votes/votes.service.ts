import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Board } from '../boards/entities/board.entity';
import { BoardMember } from '../boards/entities/board-member.entity';
import { Vote } from './entities/vote.entity';

export interface VoteResult {
  remaining: number;
  count: number;
}

@Injectable()
export class VotesService {
  constructor(
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    private readonly dataSource: DataSource,
  ) {}

  async cast(
    boardId: string,
    noteId: string,
    userId: string,
  ): Promise<VoteResult> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // Pessimistic lock on the caller's own membership row: serializes this user's
      // concurrent casts (double click, two tabs) without blocking other voters.
      const member = await manager.findOne(BoardMember, {
        where: { boardId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!member) {
        throw new WsException({
          code: 'NOT_A_MEMBER',
          message: 'Not a member of this board.',
        });
      }

      const spent = await manager.count(Vote, { where: { boardId, userId } });
      if (spent >= member.voteBudget) {
        throw new WsException({
          code: 'BUDGET_EXCEEDED',
          message: 'No votes remaining.',
          meta: { budget: member.voteBudget, spent },
        });
      }

      const board = await manager.findOneByOrFail(Board, { id: boardId });
      const votesOnNote = await manager.count(Vote, {
        where: { noteId, userId },
      });
      if (!board.allowMultiVote && votesOnNote > 0) {
        throw new WsException({
          code: 'ALREADY_VOTED',
          message: 'You already voted for this note.',
        });
      }

      await manager.insert(Vote, { boardId, noteId, userId });
      return {
        remaining: member.voteBudget - spent - 1,
        count: votesOnNote + 1,
      };
    });
  }

  async retract(
    boardId: string,
    noteId: string,
    userId: string,
  ): Promise<VoteResult> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const member = await manager.findOne(BoardMember, {
        where: { boardId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!member) {
        throw new WsException({
          code: 'NOT_A_MEMBER',
          message: 'Not a member of this board.',
        });
      }

      // Nothing to retract is a no-op, not an error: the client's optimistic
      // rollback path already treats the current remaining/count as the truth.
      const existing = await manager.findOne(Vote, {
        where: { boardId, noteId, userId },
        order: { createdAt: 'DESC' },
      });
      if (existing) {
        await manager.delete(Vote, { id: existing.id });
      }

      const spent = await manager.count(Vote, { where: { boardId, userId } });
      const noteCount = await manager.count(Vote, {
        where: { noteId, userId },
      });
      return { remaining: member.voteBudget - spent, count: noteCount };
    });
  }

  async tally(boardId: string): Promise<Record<string, number>> {
    const rows = await this.votes
      .createQueryBuilder('v')
      .select('v.note_id', 'noteId')
      .addSelect('COUNT(*)', 'count')
      .where('v.board_id = :boardId', { boardId })
      .groupBy('v.note_id')
      .getRawMany<{ noteId: string; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.noteId, Number(r.count)]));
  }

  async myVotes(
    boardId: string,
    userId: string,
  ): Promise<Record<string, number>> {
    const rows = await this.votes
      .createQueryBuilder('v')
      .select('v.note_id', 'noteId')
      .addSelect('COUNT(*)', 'count')
      .where('v.board_id = :boardId', { boardId })
      .andWhere('v.user_id = :userId', { userId })
      .groupBy('v.note_id')
      .getRawMany<{ noteId: string; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.noteId, Number(r.count)]));
  }
}
