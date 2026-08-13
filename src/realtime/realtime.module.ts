import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { BoardsModule } from '../boards/boards.module';
import { Note } from '../notes/entities/note.entity';
import { BoardColumn } from '../boards/entities/board-column.entity';
import { NotesService } from '../notes/notes.service';
import { NoteSerializerService } from '../notes/note-serializer.service';
import { WsAuthService } from './ws-auth.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { PhaseGuard } from './guards/phase.guard';
import { BoardSnapshotService } from './board-snapshot.service';
import { PresenceService } from './presence.service';
import { BoardGateway } from './board.gateway';

@Module({
  imports: [
    UsersModule,
    BoardsModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([Note, BoardColumn]),
  ],
  providers: [
    NotesService,
    NoteSerializerService,
    WsAuthService,
    WsJwtGuard,
    PhaseGuard,
    BoardSnapshotService,
    PresenceService,
    BoardGateway,
  ],
})
export class RealtimeModule {}
