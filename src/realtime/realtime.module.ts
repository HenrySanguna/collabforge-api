import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { BoardsModule } from '../boards/boards.module';
import { Note } from '../notes/entities/note.entity';
import { BoardColumn } from '../boards/entities/board-column.entity';
import { NotesService } from '../notes/notes.service';
import { NoteSerializerService } from '../notes/note-serializer.service';
import { Vote } from '../votes/entities/vote.entity';
import { VotesService } from '../votes/votes.service';
import { SessionService } from '../session/session.service';
import { ActionItem } from '../action-items/entities/action-item.entity';
import { ActionItemsService } from '../action-items/action-items.service';
import { WsAuthService } from './ws-auth.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { PhaseGuard } from './guards/phase.guard';
import { WsExceptionFilter } from './ws-exception.filter';
import { BoardSnapshotService } from './board-snapshot.service';
import { PresenceService } from './presence.service';
import { BoardGateway } from './board.gateway';
import { WsObservabilityInterceptor } from '../observability/ws-observability.interceptor';

@Module({
  imports: [
    UsersModule,
    BoardsModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([Note, BoardColumn, Vote, ActionItem]),
  ],
  providers: [
    NotesService,
    NoteSerializerService,
    VotesService,
    SessionService,
    ActionItemsService,
    WsAuthService,
    WsJwtGuard,
    PhaseGuard,
    WsExceptionFilter,
    WsObservabilityInterceptor,
    BoardSnapshotService,
    PresenceService,
    BoardGateway,
  ],
  exports: [VotesService],
})
export class RealtimeModule {}
