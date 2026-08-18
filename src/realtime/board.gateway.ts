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
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Namespace } from 'socket.io';
import { WsAuthService } from './ws-auth.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { PhaseGuard } from './guards/phase.guard';
import { AllowedPhases } from './decorators/allowed-phases.decorator';
import { WsExceptionFilter } from './ws-exception.filter';
import { BoardSnapshotService } from './board-snapshot.service';
import { PresenceService } from './presence.service';
import { toWsErrorPayload } from './ws-error.util';
import { requireSocketData } from './socket-data.util';
import { MetricsService } from '../observability/metrics.service';
import { WsObservabilityInterceptor } from '../observability/ws-observability.interceptor';
import { MembersService } from '../boards/members.service';
import { BoardsService } from '../boards/boards.service';
import { NotesService } from '../notes/notes.service';
import { NoteSerializerService } from '../notes/note-serializer.service';
import { VotesService } from '../votes/votes.service';
import { SessionService } from '../session/session.service';
import {
  ActionItemsService,
  toActionItemDto,
} from '../action-items/action-items.service';
import { avatarColorFor } from '../auth/avatar-color.util';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { MoveNoteDto } from './dto/move-note.dto';
import { DeleteNoteDto } from './dto/delete-note.dto';
import { CursorMoveDto } from './dto/cursor-move.dto';
import { CastVoteDto } from './dto/cast-vote.dto';
import { RetractVoteDto } from './dto/retract-vote.dto';
import { ChangePhaseDto } from './dto/change-phase.dto';
import { StartTimerDto } from './dto/start-timer.dto';
import { KickMemberDto } from './dto/kick-member.dto';
import { CreateActionItemDto } from './dto/create-action-item.dto';
import { UpdateActionItemDto } from './dto/update-action-item.dto';
import { DeleteActionItemDto } from './dto/delete-action-item.dto';
import type {
  AuthenticatedSocket,
  SocketData,
} from './types/authenticated-socket.interface';
import type {
  Ack,
  CreateNoteAck,
  UpdateNoteAck,
  MoveNoteAck,
  DeleteNoteAck,
  CastVoteAck,
  RetractVoteAck,
  StartTimerAck,
  ParticipantDto,
  CreateActionItemAck,
  UpdateActionItemAck,
  DeleteActionItemAck,
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
@UseInterceptors(WsObservabilityInterceptor)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Namespace;

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly members: MembersService,
    private readonly boards: BoardsService,
    private readonly notes: NotesService,
    private readonly serializer: NoteSerializerService,
    private readonly snapshot: BoardSnapshotService,
    private readonly presence: PresenceService,
    private readonly votes: VotesService,
    private readonly session: SessionService,
    private readonly actionItems: ActionItemsService,
    private readonly metrics: MetricsService,
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
      client.data.rootId =
        (client.handshake.auth?.correlationId as string | undefined) ||
        randomUUID();
      client.data.connectedAt = Date.now();
      this.metrics.incConnection();
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
        this.server.to(room(boardId)).emit('presence:updated', {
          participants: this.presence.list(boardId),
        });
      }
    } catch (err) {
      client.emit('error', toWsErrorPayload(err));
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const { boardId, user, connectedAt } = client.data;
    if (!boardId || !user) return;

    this.metrics.decConnection();
    if (connectedAt) {
      this.metrics.recordBoardSessionDuration(
        (Date.now() - connectedAt) / 1000,
      );
    }

    const isLastTab = this.presence.removeConnection(
      boardId,
      user.id,
      client.id,
    );
    if (isLastTab) {
      this.server.to(room(boardId)).emit('presence:updated', {
        participants: this.presence.list(boardId),
      });
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

  // ── Votos ────────────────────────────────────────────────────
  @AllowedPhases('VOTING')
  @SubscribeMessage('vote:cast')
  async onVoteCast(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CastVoteDto,
  ): Promise<CastVoteAck> {
    const { boardId, user } = requireSocketData(client);
    try {
      const result = await this.votes.cast(boardId, dto.noteId, user.id);
      client.emit('vote:my-update', {
        noteId: dto.noteId,
        count: result.count,
        remaining: result.remaining,
      });
      await this.broadcastTallyIfLive(boardId);
      return { ok: true, data: { remaining: result.remaining } };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @AllowedPhases('VOTING')
  @SubscribeMessage('vote:retract')
  async onVoteRetract(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: RetractVoteDto,
  ): Promise<RetractVoteAck> {
    const { boardId, user } = requireSocketData(client);
    try {
      const result = await this.votes.retract(boardId, dto.noteId, user.id);
      client.emit('vote:my-update', {
        noteId: dto.noteId,
        count: result.count,
        remaining: result.remaining,
      });
      await this.broadcastTallyIfLive(boardId);
      return { ok: true, data: { remaining: result.remaining } };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  // ── Sesión (solo owner) ─────────────────────────────────────
  @SubscribeMessage('session:change-phase')
  async onSessionChangePhase(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: ChangePhaseDto,
  ): Promise<Ack<void>> {
    const { boardId, user } = requireSocketData(client);
    try {
      const board = await this.session.changePhase(boardId, user.id, dto.phase);
      this.server.to(room(boardId)).emit('session:phase-changed', {
        phase: board.phase,
        revealed: board.revealed,
      });
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @SubscribeMessage('session:start-timer')
  async onSessionStartTimer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: StartTimerDto,
  ): Promise<StartTimerAck> {
    const { boardId, user } = requireSocketData(client);
    try {
      const { endsAt } = await this.session.startTimer(
        boardId,
        user.id,
        dto.durationSeconds,
      );
      this.server
        .to(room(boardId))
        .emit('session:timer-updated', { endsAt, paused: false });
      return { ok: true, data: { endsAt } };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @SubscribeMessage('session:pause-timer')
  async onSessionPauseTimer(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<Ack<void>> {
    const { boardId, user } = requireSocketData(client);
    try {
      const state = await this.session.pauseTimer(boardId, user.id);
      this.server.to(room(boardId)).emit('session:timer-updated', state);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @SubscribeMessage('session:cancel-timer')
  async onSessionCancelTimer(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<Ack<void>> {
    const { boardId, user } = requireSocketData(client);
    try {
      const state = await this.session.cancelTimer(boardId, user.id);
      this.server.to(room(boardId)).emit('session:timer-updated', state);
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @SubscribeMessage('session:reveal')
  async onSessionReveal(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<Ack<void>> {
    const { boardId, user } = requireSocketData(client);
    try {
      await this.session.reveal(boardId, user.id);
      this.server.to(room(boardId)).emit('board:revealed', { revealed: true });

      // board:sync carries viewer-scoped fields (myRole, myVotes...), so it can't be
      // broadcast as a single room-wide payload. Instead we rebuild it once per
      // currently connected socket, using socket.io's own room membership lookup.
      const sockets = await this.server.in(room(boardId)).fetchSockets();
      await Promise.all(
        sockets.map(async (socket) => {
          const data = socket.data as Partial<SocketData>;
          if (!data.user || !data.role) return;
          const viewerSnapshot = await this.snapshot.build(
            boardId,
            data.user.id,
            data.role,
          );
          socket.emit('board:sync', viewerSnapshot);
        }),
      );

      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @SubscribeMessage('member:kick')
  async onMemberKick(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: KickMemberDto,
  ): Promise<Ack<void>> {
    const { boardId, user } = requireSocketData(client);
    try {
      await this.session.kick(boardId, user.id, dto.userId);

      const socketIds = this.presence.socketIdsFor(boardId, dto.userId);
      for (const socketId of socketIds) {
        const target = this.server.sockets.get(socketId);
        if (!target) continue;
        target.emit('board:kicked', { reason: 'KICKED_BY_OWNER' });
        // Disconnecting triggers the existing handleDisconnect → presence removal
        // → presence:updated flow; no need to broadcast that separately here.
        target.disconnect(true);
      }

      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  // ── Action items (solo owner, solo DISCUSSING) ──────────────
  @AllowedPhases('DISCUSSING')
  @SubscribeMessage('action-item:create')
  async onActionItemCreate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CreateActionItemDto,
  ): Promise<CreateActionItemAck> {
    const { boardId, user } = requireSocketData(client);
    try {
      const item = await this.actionItems.create(boardId, user.id, dto);
      const payload = toActionItemDto(item);
      client.to(room(boardId)).emit('action-item:created', payload);
      return { ok: true, data: { item: payload } };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @AllowedPhases('DISCUSSING')
  @SubscribeMessage('action-item:update')
  async onActionItemUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: UpdateActionItemDto,
  ): Promise<UpdateActionItemAck> {
    const { boardId, user } = requireSocketData(client);
    try {
      const item = await this.actionItems.update(boardId, user.id, dto);
      const payload = toActionItemDto(item);
      client.to(room(boardId)).emit('action-item:updated', payload);
      return { ok: true, data: { item: payload } };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  @AllowedPhases('DISCUSSING')
  @SubscribeMessage('action-item:delete')
  async onActionItemDelete(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: DeleteActionItemDto,
  ): Promise<DeleteActionItemAck> {
    const { boardId, user } = requireSocketData(client);
    try {
      await this.actionItems.remove(boardId, user.id, dto.id);
      client.to(room(boardId)).emit('action-item:deleted', { id: dto.id });
      return { ok: true, data: undefined };
    } catch (err) {
      return { ok: false, error: toWsErrorPayload(err) };
    }
  }

  private async broadcastTallyIfLive(boardId: string): Promise<void> {
    const board = await this.boards.findByIdOrFail(boardId);
    if (!board.liveTally && !board.revealed) return;
    const tally = await this.votes.tally(boardId);
    this.server.to(room(boardId)).emit('vote:tally', { tally });
  }
}
