import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { BoardMember } from './entities/board-member.entity';
import { BoardsController } from './boards.controller';
import { InvitationsController } from './invitations.controller';
import { BoardsService } from './boards.service';
import { MembersService } from './members.service';
import { InvitationsService } from './invitations.service';
import { BoardMemberGuard } from './guards/board-member.guard';
import { BoardRoleGuard } from './guards/board-role.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Board, BoardColumn, BoardMember]),
    JwtModule.register({}),
  ],
  controllers: [BoardsController, InvitationsController],
  providers: [
    BoardsService,
    MembersService,
    InvitationsService,
    BoardMemberGuard,
    BoardRoleGuard,
  ],
  exports: [BoardsService, MembersService],
})
export class BoardsModule {}
