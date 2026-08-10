import { randomUUID } from 'node:crypto';
import { BadRequestException, GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Board } from './entities/board.entity';
import { BoardsService } from './boards.service';
import { MembersService } from './members.service';
import type {
  BoardDetailDto,
  InviteLinkDto,
} from './types/board-response.interface';

interface InvitePayload {
  boardId: string;
  tokenId: string;
}

const DEFAULT_TTL_HOURS = 24;

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    private readonly boardsService: BoardsService,
    private readonly membersService: MembersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async generate(
    boardId: string,
    ownerId: string,
    ttlHours: number = DEFAULT_TTL_HOURS,
  ): Promise<InviteLinkDto> {
    const board = await this.boardsService.requireOwner(boardId, ownerId);

    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    board.inviteTokenId = tokenId;
    board.inviteExpiresAt = expiresAt;
    await this.boards.save(board);

    const token = await this.jwt.signAsync(
      { boardId, tokenId } satisfies InvitePayload,
      {
        secret: this.config.getOrThrow<string>('INVITE_SECRET'),
        expiresIn: ttlHours * 60 * 60,
      },
    );

    return { token, expiresAt: expiresAt.toISOString() };
  }

  async revoke(boardId: string, ownerId: string): Promise<void> {
    const board = await this.boardsService.requireOwner(boardId, ownerId);
    board.inviteTokenId = null;
    board.inviteExpiresAt = null;
    await this.boards.save(board);
  }

  async accept(rawToken: string, userId: string): Promise<BoardDetailDto> {
    let payload: InvitePayload;
    try {
      payload = await this.jwt.verifyAsync<InvitePayload>(rawToken, {
        secret: this.config.getOrThrow<string>('INVITE_SECRET'),
      });
    } catch {
      throw new BadRequestException({
        code: 'INVALID_INVITE',
        message: 'Invalid or expired invite link.',
      });
    }

    const board = await this.boardsService.findByIdOrFail(payload.boardId);

    if (board.inviteTokenId !== payload.tokenId) {
      throw new GoneException({
        code: 'INVITE_REVOKED',
        message: 'This invite link is no longer valid.',
      });
    }
    if (board.isArchived) {
      throw new BadRequestException({
        code: 'BOARD_ARCHIVED',
        message: 'This board is archived.',
      });
    }

    await this.membersService.addMember(board.id, userId, 'member');

    return this.boardsService.findBySlugForUser(board.slug, userId);
  }
}
