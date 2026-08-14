import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardColumn } from '../boards/entities/board-column.entity';
import { BoardsService } from '../boards/boards.service';
import type { BoardRole } from '../boards/entities/board-member.entity';
import { NotesService } from '../notes/notes.service';
import { NoteSerializerService } from '../notes/note-serializer.service';
import { VotesService } from '../votes/votes.service';
import { PresenceService } from './presence.service';
import type { BoardSnapshot } from '../contracts';

@Injectable()
export class BoardSnapshotService {
  constructor(
    @InjectRepository(BoardColumn)
    private readonly columns: Repository<BoardColumn>,
    private readonly boards: BoardsService,
    private readonly notes: NotesService,
    private readonly serializer: NoteSerializerService,
    private readonly presence: PresenceService,
    private readonly votes: VotesService,
  ) {}

  async build(
    boardId: string,
    viewerId: string,
    viewerRole: BoardRole,
  ): Promise<BoardSnapshot> {
    const board = await this.boards.findByIdOrFail(boardId);
    const showTally = board.revealed || board.liveTally;
    const [columns, notes, myVotes, tally] = await Promise.all([
      this.columns.find({ where: { boardId }, order: { position: 'ASC' } }),
      this.notes.findAllForBoard(boardId),
      this.votes.myVotes(boardId, viewerId),
      showTally ? this.votes.tally(boardId) : Promise.resolve(null),
    ]);

    return {
      board: {
        id: board.id,
        slug: board.slug,
        title: board.title,
        phase: board.phase,
        revealed: board.revealed,
        voteBudget: board.voteBudget,
        allowMultiVote: board.allowMultiVote,
        liveTally: board.liveTally,
        timerEndsAt: board.timerEndsAt ? board.timerEndsAt.toISOString() : null,
        isArchived: board.isArchived,
        ownerId: board.ownerId,
      },
      columns: columns.map((c) => ({
        id: c.id,
        title: c.title,
        color: c.color,
        position: c.position,
      })),
      notes: notes.map((n) =>
        this.serializer.forViewer(n, board, viewerId, viewerRole),
      ),
      myVotes,
      tally,
      participants: this.presence.list(boardId),
      actionItems: [],
      myRole: viewerRole,
      serverTime: new Date().toISOString(),
    };
  }
}
