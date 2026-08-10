import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.interface';
import { BoardsService } from './boards.service';
import { InvitationsService } from './invitations.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { ListBoardsQueryDto } from './dto/list-boards.dto';
import { BoardMemberGuard } from './guards/board-member.guard';
import { BoardRoleGuard } from './guards/board-role.guard';
import { RequireBoardRole } from './decorators/require-board-role.decorator';

@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(
    private readonly boards: BoardsService,
    private readonly invitations: InvitationsService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBoardDto) {
    return this.boards.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListBoardsQueryDto) {
    return this.boards.listForUser(user.id, query.page, query.limit);
  }

  @Get(':slug')
  detail(@CurrentUser() user: AuthUser, @Param('slug') slug: string) {
    return this.boards.findBySlugForUser(slug, user.id);
  }

  @UseGuards(BoardMemberGuard, BoardRoleGuard)
  @RequireBoardRole('owner')
  @Patch(':boardId/archive')
  archive(@CurrentUser() user: AuthUser, @Param('boardId') boardId: string) {
    return this.boards.archive(boardId, user.id);
  }

  @UseGuards(BoardMemberGuard, BoardRoleGuard)
  @RequireBoardRole('owner')
  @Post(':boardId/invite')
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
  ) {
    return this.invitations.generate(boardId, user.id);
  }

  @UseGuards(BoardMemberGuard, BoardRoleGuard)
  @RequireBoardRole('owner')
  @Delete(':boardId/invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param('boardId') boardId: string,
  ): Promise<void> {
    return this.invitations.revoke(boardId, user.id);
  }
}
