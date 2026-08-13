import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import {
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Server } from 'socket.io';
import { WsAuthService } from './ws-auth.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { PhaseGuard } from './guards/phase.guard';
import { AllowedPhases } from './decorators/allowed-phases.decorator';
import { WsExceptionFilter } from './ws-exception.filter';
import { BoardSnapshotService } from './board-snapshot.service';
import { PresenceService } from './presence.service';
import { toWsErrorPayload } from './ws-error.util';
import { requireSocketData } from './socket-data.util';
import { MembersService } from '../boards/members.service';
import { BoardsService } from '../boards/boards.service';
import { NotesService } from '../notes/notes.service';
import { NoteSerializerService } from '../notes/note-serializer.service';
import { avatarColorFor } from '../auth/avatar-color.util';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { MoveNoteDto } from './dto/move-note.dto';
import { DeleteNoteDto } from './dto/delete-note.dto';
import { CursorMoveDto } from './dto/cursor-move.dto';
import type { AuthenticatedSocket } from './types/authenticated-socket.interface';
import type {
  CreateNoteAck,
  UpdateNoteAck,
  MoveNoteAck,
  DeleteNoteAck,
  ParticipantDto,
} from '../contracts';

export function room(boardId: string): string {
  return `board:${boardId}`;
}

@WebSocketGateway({
  namespace: '/board',
  // los decoradores de gateway se evalúan al cargar el módulo, antes de que
  // exista el contenedor de DI: ConfigService todavía no está disponible aquí.
  cors: { origin: process.env.CORS_ORIGINS?.split(','), credentials: true },
})
@UseGuards(WsJwtGuard, PhaseGuard)
@UseFilters(WsExceptionFilter)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly members: MembersService,
    private readonly boards: BoardsService,
    private readonly notes: NotesService,
    private readonly serializer: NoteSerializerService,
    private readonly snapshot: BoardSnapshotService,
    private readonly presence: PresenceService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      const user = await this.wsAuth.verify(token);

      const boardId = String(client.handshake.query.boardId ?? '');
      if (!boardId) {
        throw new WsException({
          code: 'BOARD_NOT_FOUND',
          message: 'Missing boardId.',
        });
      }
      await this.boards.findByIdOrFail(boardId);
      const membership = await this.members.requireMembership(boardId, user.id);

      client.data.user = user;
      client.data.boardId = boardId;
      client.data.role = membership.role;
      await client.join(room(boardId));

      client.emit(
        'board:sync',
        await this.snapshot.build(boardId, user.id, membership.role),
      );

      const participant: ParticipantDto = {
        userId: user.id,
        name: user.name,
        avatarColor: avatarColorFor(user.email),
        role: membership.role,
        isOnline: true,
      };
      const isFirstTab = this.presence.addConnection(
        boardId,
        participant,
        client.id,
      );
      if (isFirstTab) {
        this.server
          .to(room(boardId))
          .emit('presence:updated', { participants: this.presence.list(boardId) });
      }
    } catch (err) {
      client.emit('error', toWsErrorPayload(err));
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const { boardId, user } = client.data;
    if (!boardId || !user) return;

    const isLastTab = this.presence.removeConnection(
      boardId,
      user.id,
      client.id,
    );
    if (isLastTab) {
      this.server
        .to(room(boardId))
        .emit('presence:updated', { participants: this.presence.list(boardId) });
    }
  }

  @AllowedPhases('COLLECTING')
  @SubscribeMessage('note:create')
  async onNoteCreate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CreateNoteDto,
  ): Promise<CreateNoteAck> {
    const { boardId, user } = requireSocketData(client);
    try {
      const note = await this.notes.create(boardId, user.id, dto);
      const board = await this.boards.findByIdOrFail(boardId);
      client
        .to(room(boardId))
        .emit('note:created', this.serializer.forOthers(note, board));
      return {
        ok: true,
        data: { note: this.serializer.forAuthor(note), tempId: dto.tempId },
      };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @AllowedPhases('COLLECTING', 'GROUPING')
  @SubscribeMessage('note:update')
  async onNoteUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: UpdateNoteDto,
  ): Promise<UpdateNoteAck> {
    const { boardId, user } = requireSocketData(client);
    try {
      const note = await this.notes.update(boardId, user.id, dto);
      const board = await this.boards.findByIdOrFail(boardId);
      client
        .to(room(boardId))
        .emit('note:updated', this.serializer.forOthers(note, board));
      return { ok: true, data: { note: this.serializer.forAuthor(note) } };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @AllowedPhases('GROUPING')
  @SubscribeMessage('note:move')
  async onNoteMove(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: MoveNoteDto,
  ): Promise<MoveNoteAck> {
    const { boardId } = requireSocketData(client);
    try {
      const note = await this.notes.move(boardId, dto);
      const payload = {
        noteId: note.id,
        columnId: note.columnId,
        position: note.position,
        version: note.version,
      };
      client.to(room(boardId)).emit('note:moved', payload);
      return { ok: true, data: { note: payload } };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @AllowedPhases('COLLECTING', 'GROUPING')
  @SubscribeMessage('note:delete')
  async onNoteDelete(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: DeleteNoteDto,
  ): Promise<DeleteNoteAck> {
    const { boardId, user, role } = requireSocketData(client);
    try {
      await this.notes.remove(boardId, user.id, role, dto.noteId);
      client.to(room(boardId)).emit('note:deleted', { noteId: dto.noteId });
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @SubscribeMessage('cursor:move')
  onCursorMove(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CursorMoveDto,
  ): void {
    const { boardId, user } = requireSocketData(client);
    client.volatile
      .to(room(boardId))
      .emit('cursor:moved', { userId: user.id, x: dto.x, y: dto.y });
  }
}
