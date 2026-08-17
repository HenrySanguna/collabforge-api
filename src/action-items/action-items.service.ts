import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardsService } from '../boards/boards.service';
import { Board } from '../boards/entities/board.entity';
import { ActionItem } from './entities/action-item.entity';
import type { ActionItemDto } from '../contracts';

export function toActionItemDto(item: ActionItem): ActionItemDto {
  return {
    id: item.id,
    text: item.text,
    assigneeId: item.assigneeId,
    status: item.status,
    createdBy: item.createdBy,
    createdAt: item.createdAt.toISOString(),
  };
}

interface CreateActionItemInput {
  text: string;
  assigneeId?: string | null;
}

interface UpdateActionItemInput {
  id: string;
  text?: string;
  assigneeId?: string | null;
  status?: 'open' | 'done';
}

@Injectable()
export class ActionItemsService {
  constructor(
    @InjectRepository(ActionItem)
    private readonly actionItems: Repository<ActionItem>,
    private readonly boards: BoardsService,
  ) {}

  findAllForBoard(boardId: string): Promise<ActionItem[]> {
    return this.actionItems.find({
      where: { boardId },
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    boardId: string,
    userId: string,
    input: CreateActionItemInput,
  ): Promise<ActionItem> {
    await this.requireOwnerInDiscussing(boardId, userId);

    const item = this.actionItems.create({
      boardId,
      text: input.text,
      assigneeId: input.assigneeId ?? null,
      status: 'open',
      createdBy: userId,
    });
    return this.actionItems.save(item);
  }

  async update(
    boardId: string,
    userId: string,
    input: UpdateActionItemInput,
  ): Promise<ActionItem> {
    await this.requireOwnerInDiscussing(boardId, userId);
    const item = await this.findByIdInBoardOrFail(boardId, input.id);

    if (input.text !== undefined) item.text = input.text;
    if (input.assigneeId !== undefined) item.assigneeId = input.assigneeId;
    if (input.status !== undefined) item.status = input.status;

    return this.actionItems.save(item);
  }

  async remove(boardId: string, userId: string, id: string): Promise<void> {
    await this.requireOwnerInDiscussing(boardId, userId);
    const item = await this.findByIdInBoardOrFail(boardId, id);
    await this.actionItems.remove(item);
  }

  private async requireOwnerInDiscussing(
    boardId: string,
    userId: string,
  ): Promise<Board> {
    const board = await this.boards.findByIdOrFail(boardId);
    if (board.ownerId !== userId) {
      throw new WsException({
        code: 'FORBIDDEN_ROLE',
        message: 'Only the board owner can manage action items.',
      });
    }
    if (board.phase !== 'DISCUSSING') {
      throw new WsException({
        code: 'PHASE_NOT_ALLOWED',
        message: `Action items can only be managed in DISCUSSING, not ${board.phase}.`,
        meta: { currentPhase: board.phase },
      });
    }
    return board;
  }

  private async findByIdInBoardOrFail(
    boardId: string,
    id: string,
  ): Promise<ActionItem> {
    const item = await this.actionItems.findOne({ where: { id } });
    if (!item || item.boardId !== boardId) {
      throw new WsException({
        code: 'ACTION_ITEM_NOT_FOUND',
        message: 'Action item not found.',
      });
    }
    return item;
  }
}
