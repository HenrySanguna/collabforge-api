import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Board } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { BoardMember } from './entities/board-member.entity';
import { MembersService } from './members.service';
import { BOARD_TEMPLATES } from './templates';
import { generateSlug } from './slug.util';
import type { BoardTemplate } from './templates';
import type { CreateBoardDto } from './dto/create-board.dto';
import type {
  BoardDetailDto,
  BoardSummaryDto,
  PaginatedResult,
} from './types/board-response.interface';

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    @InjectRepository(BoardMember)
    private readonly members: Repository<BoardMember>,
    private readonly dataSource: DataSource,
    private readonly membersService: MembersService,
  ) {}

  async create(ownerId: string, dto: CreateBoardDto): Promise<BoardDetailDto> {
    const template: BoardTemplate = BOARD_TEMPLATES[dto.templateKey];

    const { board, columns } = await this.dataSource.transaction(
      async (manager) => {
        const created = await manager.save(
          Board,
          manager.create(Board, {
            title: dto.title,
            slug: generateSlug(dto.title),
            ownerId,
          }),
        );

        const columnsResult = await manager.insert(
          BoardColumn,
          template.columns.map((c) => ({ ...c, boardId: created.id })),
        );
        await manager.insert(BoardMember, {
          boardId: created.id,
          userId: ownerId,
          role: 'owner',
        });

        const identifiers = columnsResult.identifiers as { id: string }[];
        const insertedColumns: BoardColumn[] = template.columns.map((c, i) =>
          manager.create(BoardColumn, {
            id: identifiers[i].id,
            boardId: created.id,
            title: c.title,
            color: c.color,
            position: c.position,
          }),
        );

        return { board: created, columns: insertedColumns };
      },
    );

    return this.toDetailDto(board, 'owner', columns);
  }

  async listForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<BoardSummaryDto>> {
    const [memberships, total] = await this.members.findAndCount({
      where: { userId },
      relations: { board: true },
      order: { board: { updatedAt: 'DESC' } },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: memberships.map((m) => this.toSummaryDto(m.board, m.role)),
      page,
      limit,
      total,
    };
  }

  async findBySlugForUser(
    slug: string,
    userId: string,
  ): Promise<BoardDetailDto> {
    const board = await this.boards.findOne({
      where: { slug },
      relations: { columns: true },
    });
    if (!board)
      throw new NotFoundException({
        code: 'BOARD_NOT_FOUND',
        message: 'Board not found.',
      });

    const membership = await this.membersService.requireMembership(
      board.id,
      userId,
    );
    return this.toDetailDto(board, membership.role, board.columns);
  }

  async findByIdOrFail(boardId: string): Promise<Board> {
    const board = await this.boards.findOneBy({ id: boardId });
    if (!board)
      throw new NotFoundException({
        code: 'BOARD_NOT_FOUND',
        message: 'Board not found.',
      });
    return board;
  }

  async requireOwner(boardId: string, userId: string): Promise<Board> {
    const board = await this.findByIdOrFail(boardId);
    if (board.ownerId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: 'Only the board owner can perform this action.',
      });
    }
    return board;
  }

  async archive(boardId: string, userId: string): Promise<BoardDetailDto> {
    const board = await this.requireOwner(boardId, userId);
    board.isArchived = true;
    await this.boards.save(board);

    const columns = await this.boards.manager.find(BoardColumn, {
      where: { boardId },
    });
    return this.toDetailDto(board, 'owner', columns);
  }

  private toSummaryDto(
    board: Board,
    role: BoardSummaryDto['myRole'],
  ): BoardSummaryDto {
    return {
      id: board.id,
      slug: board.slug,
      title: board.title,
      phase: board.phase,
      isArchived: board.isArchived,
      myRole: role,
      createdAt: board.createdAt.toISOString(),
      updatedAt: board.updatedAt.toISOString(),
    };
  }

  private toDetailDto(
    board: Board,
    role: BoardSummaryDto['myRole'],
    columns: BoardColumn[],
  ): BoardDetailDto {
    return {
      ...this.toSummaryDto(board, role),
      ownerId: board.ownerId,
      revealed: board.revealed,
      voteBudget: board.voteBudget,
      allowMultiVote: board.allowMultiVote,
      liveTally: board.liveTally,
      columns: columns
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          id: c.id,
          title: c.title,
          color: c.color,
          position: c.position,
        })),
    };
  }
}
