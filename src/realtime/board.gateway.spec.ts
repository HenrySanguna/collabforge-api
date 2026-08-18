import { WsException } from '@nestjs/websockets';
import { BoardGateway, room } from './board.gateway';
import { avatarColorFor } from '../auth/avatar-color.util';
import type { WsAuthService } from './ws-auth.service';
import type { BoardSnapshotService } from './board-snapshot.service';
import type { PresenceService } from './presence.service';
import type { MembersService } from '../boards/members.service';
import type { BoardsService } from '../boards/boards.service';
import type { NotesService } from '../notes/notes.service';
import type { NoteSerializerService } from '../notes/note-serializer.service';
import type { VotesService } from '../votes/votes.service';
import type { SessionService } from '../session/session.service';
import type { ActionItemsService } from '../action-items/action-items.service';
import type { MetricsService } from '../observability/metrics.service';

function aClient(dataOverrides: object = {}) {
  return {
    id: 'socket-1',
    data: {
      user: { id: 'user-1', email: 'ana@test.com', name: 'Ana' },
      boardId: 'board-1',
      role: 'member',
      ...dataOverrides,
    },
    handshake: {
      auth: { token: 'valid-token' },
      query: { boardId: 'board-1' },
    },
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    volatile: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    disconnect: jest.fn(),
  };
}

describe('BoardGateway', () => {
  let gateway: BoardGateway;
  let wsAuth: { verify: jest.Mock };
  let members: { requireMembership: jest.Mock };
  let boards: { findByIdOrFail: jest.Mock };
  let notes: {
    create: jest.Mock;
    update: jest.Mock;
    move: jest.Mock;
    remove: jest.Mock;
  };
  let serializer: { forOthers: jest.Mock; forAuthor: jest.Mock };
  let snapshot: { build: jest.Mock };
  let presence: {
    addConnection: jest.Mock;
    removeConnection: jest.Mock;
    list: jest.Mock;
    socketIdsFor: jest.Mock;
  };
  let votes: { cast: jest.Mock; retract: jest.Mock; tally: jest.Mock };
  let session: {
    changePhase: jest.Mock;
    startTimer: jest.Mock;
    pauseTimer: jest.Mock;
    cancelTimer: jest.Mock;
    reveal: jest.Mock;
    kick: jest.Mock;
  };
  let actionItems: {
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let metrics: {
    incConnection: jest.Mock;
    decConnection: jest.Mock;
    recordBoardSessionDuration: jest.Mock;
  };
  let server: {
    to: jest.Mock;
    in: jest.Mock;
    sockets: {
      sockets: Map<string, { emit: jest.Mock; disconnect: jest.Mock }>;
    };
  };

  beforeEach(() => {
    wsAuth = { verify: jest.fn() };
    members = { requireMembership: jest.fn() };
    boards = { findByIdOrFail: jest.fn() };
    notes = {
      create: jest.fn(),
      update: jest.fn(),
      move: jest.fn(),
      remove: jest.fn(),
    };
    serializer = {
      forOthers: jest
        .fn()
        .mockReturnValue({ id: 'note-1', projection: 'others' }),
      forAuthor: jest
        .fn()
        .mockReturnValue({ id: 'note-1', projection: 'author' }),
    };
    snapshot = { build: jest.fn().mockResolvedValue({ board: {} }) };
    presence = {
      addConnection: jest.fn().mockReturnValue(true),
      removeConnection: jest.fn().mockReturnValue(true),
      list: jest.fn().mockReturnValue([]),
      socketIdsFor: jest.fn().mockReturnValue([]),
    };
    votes = {
      cast: jest.fn(),
      retract: jest.fn(),
      tally: jest.fn().mockResolvedValue({}),
    };
    session = {
      changePhase: jest.fn(),
      startTimer: jest.fn(),
      pauseTimer: jest.fn(),
      cancelTimer: jest.fn(),
      reveal: jest.fn(),
      kick: jest.fn(),
    };
    actionItems = {
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    metrics = {
      incConnection: jest.fn(),
      decConnection: jest.fn(),
      recordBoardSessionDuration: jest.fn(),
    };

    gateway = new BoardGateway(
      wsAuth as unknown as WsAuthService,
      members as unknown as MembersService,
      boards as unknown as BoardsService,
      notes as unknown as NotesService,
      serializer as unknown as NoteSerializerService,
      snapshot as unknown as BoardSnapshotService,
      presence as unknown as PresenceService,
      votes as unknown as VotesService,
      session as unknown as SessionService,
      actionItems as unknown as ActionItemsService,
      metrics as unknown as MetricsService,
    );

    server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
      in: jest
        .fn()
        .mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) }),
      sockets: { sockets: new Map() },
    };
    (gateway as unknown as { server: typeof server }).server = server;
  });

  describe('handleConnection', () => {
    it('autentica, une la sala y emite el snapshot inicial', async () => {
      const client = aClient({
        user: undefined,
        boardId: undefined,
        role: undefined,
      });
      wsAuth.verify.mockResolvedValue({
        id: 'user-1',
        email: 'ana@test.com',
        name: 'Ana',
      });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      members.requireMembership.mockResolvedValue({ role: 'owner' });

      await gateway.handleConnection(client as never);

      expect(client.join).toHaveBeenCalledWith(room('board-1'));
      expect(client.data).toMatchObject({
        user: { id: 'user-1' },
        boardId: 'board-1',
        role: 'owner',
      });
      expect(client.emit).toHaveBeenCalledWith('board:sync', { board: {} });
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('emite error y desconecta si la autenticación falla', async () => {
      const client = aClient({
        user: undefined,
        boardId: undefined,
        role: undefined,
      });
      wsAuth.verify.mockRejectedValue(new Error('bad token'));

      await gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'INTERNAL_ERROR' }),
      );
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('emite error y desconecta si no es miembro del tablero', async () => {
      const client = aClient({
        user: undefined,
        boardId: undefined,
        role: undefined,
      });
      wsAuth.verify.mockResolvedValue({
        id: 'user-1',
        email: 'ana@test.com',
        name: 'Ana',
      });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      members.requireMembership.mockRejectedValue(
        new WsException({ code: 'NOT_A_MEMBER', message: 'nope' }),
      );

      await gateway.handleConnection(client as never);

      expect(client.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'NOT_A_MEMBER' }),
      );
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('añade al usuario a presencia y difunde presence:updated a toda la sala en la primera pestaña', async () => {
      const client = aClient({
        user: undefined,
        boardId: undefined,
        role: undefined,
      });
      wsAuth.verify.mockResolvedValue({
        id: 'user-1',
        email: 'ana@test.com',
        name: 'Ana',
      });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      members.requireMembership.mockResolvedValue({ role: 'owner' });
      presence.addConnection.mockReturnValue(true);
      const participants = [{ userId: 'user-1' }];
      presence.list.mockReturnValue(participants);
      const serverEmit = jest.fn();
      server.to.mockReturnValue({ emit: serverEmit });

      await gateway.handleConnection(client as never);

      expect(presence.addConnection).toHaveBeenCalledWith(
        'board-1',
        {
          userId: 'user-1',
          name: 'Ana',
          avatarColor: avatarColorFor('ana@test.com'),
          role: 'owner',
          isOnline: true,
        },
        'socket-1',
      );
      expect(server.to).toHaveBeenCalledWith(room('board-1'));
      expect(serverEmit).toHaveBeenCalledWith('presence:updated', {
        participants,
      });
    });

    it('no difunde presence:updated en la segunda pestaña del mismo usuario', async () => {
      const client = aClient({
        user: undefined,
        boardId: undefined,
        role: undefined,
      });
      wsAuth.verify.mockResolvedValue({
        id: 'user-1',
        email: 'ana@test.com',
        name: 'Ana',
      });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      members.requireMembership.mockResolvedValue({ role: 'owner' });
      presence.addConnection.mockReturnValue(false);

      await gateway.handleConnection(client as never);

      expect(server.to).not.toHaveBeenCalled();
    });

    it('incrementa el gauge de conexiones activas al conectar exitosamente', async () => {
      const client = aClient({
        user: undefined,
        boardId: undefined,
        role: undefined,
      });
      wsAuth.verify.mockResolvedValue({
        id: 'user-1',
        email: 'ana@test.com',
        name: 'Ana',
      });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      members.requireMembership.mockResolvedValue({ role: 'owner' });

      await gateway.handleConnection(client as never);

      expect(metrics.incConnection).toHaveBeenCalledTimes(1);
    });

    it('no incrementa el gauge si la autenticación falla', async () => {
      const client = aClient({
        user: undefined,
        boardId: undefined,
        role: undefined,
      });
      wsAuth.verify.mockRejectedValue(new Error('bad token'));

      await gateway.handleConnection(client as never);

      expect(metrics.incConnection).not.toHaveBeenCalled();
    });

    it('siembra rootId desde handshake.auth.correlationId cuando está presente', async () => {
      const client = {
        id: 'socket-1',
        data: { user: undefined, boardId: undefined, role: undefined },
        handshake: {
          auth: { token: 'valid-token', correlationId: 'incoming-root' },
          query: { boardId: 'board-1' },
        },
        join: jest.fn().mockResolvedValue(undefined),
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
      wsAuth.verify.mockResolvedValue({
        id: 'user-1',
        email: 'ana@test.com',
        name: 'Ana',
      });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      members.requireMembership.mockResolvedValue({ role: 'owner' });

      await gateway.handleConnection(client as never);

      expect(client.data).toMatchObject({ rootId: 'incoming-root' });
    });

    it('genera un rootId propio si el handshake no trae uno', async () => {
      const client = {
        id: 'socket-1',
        data: { user: undefined, boardId: undefined, role: undefined },
        handshake: {
          auth: { token: 'valid-token' },
          query: { boardId: 'board-1' },
        },
        join: jest.fn().mockResolvedValue(undefined),
        emit: jest.fn(),
        disconnect: jest.fn(),
      };
      wsAuth.verify.mockResolvedValue({
        id: 'user-1',
        email: 'ana@test.com',
        name: 'Ana',
      });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      members.requireMembership.mockResolvedValue({ role: 'owner' });

      await gateway.handleConnection(client as never);

      const seededData = client.data as unknown as { rootId?: string };
      expect(typeof seededData.rootId).toBe('string');
      expect(seededData.rootId?.length).toBeGreaterThan(0);
    });
  });

  describe('handleDisconnect', () => {
    it('elimina la última pestaña y difunde presence:updated con la lista actualizada', () => {
      const client = aClient();
      presence.removeConnection.mockReturnValue(true);
      const participants: unknown[] = [];
      presence.list.mockReturnValue(participants);
      const serverEmit = jest.fn();
      server.to.mockReturnValue({ emit: serverEmit });

      gateway.handleDisconnect(client as never);

      expect(presence.removeConnection).toHaveBeenCalledWith(
        'board-1',
        'user-1',
        'socket-1',
      );
      expect(server.to).toHaveBeenCalledWith(room('board-1'));
      expect(serverEmit).toHaveBeenCalledWith('presence:updated', {
        participants,
      });
    });

    it('no difunde nada si quedan otras pestañas activas del usuario', () => {
      const client = aClient();
      presence.removeConnection.mockReturnValue(false);

      gateway.handleDisconnect(client as never);

      expect(server.to).not.toHaveBeenCalled();
    });

    it('es un no-op seguro si el socket nunca completó el handshake', () => {
      const client = aClient({
        user: undefined,
        boardId: undefined,
        role: undefined,
      });

      expect(() => gateway.handleDisconnect(client as never)).not.toThrow();
      expect(presence.removeConnection).not.toHaveBeenCalled();
      expect(server.to).not.toHaveBeenCalled();
      expect(metrics.decConnection).not.toHaveBeenCalled();
    });

    it('decrementa el gauge y registra la duración de la sesión cuando el socket tenía datos', () => {
      const client = aClient({ connectedAt: Date.now() - 1000 });

      gateway.handleDisconnect(client as never);

      expect(metrics.decConnection).toHaveBeenCalledTimes(1);
      expect(metrics.recordBoardSessionDuration).toHaveBeenCalledTimes(1);
      const [durationSeconds] =
        metrics.recordBoardSessionDuration.mock.calls[0];
      expect(durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it('no registra duración de sesión si no había connectedAt en el socket', () => {
      const client = aClient();

      gateway.handleDisconnect(client as never);

      expect(metrics.decConnection).toHaveBeenCalledTimes(1);
      expect(metrics.recordBoardSessionDuration).not.toHaveBeenCalled();
    });
  });

  describe('onCursorMove', () => {
    it('difunde cursor:moved de forma volatile a la sala', () => {
      const client = aClient();
      const volatileEmit = jest.fn();
      client.volatile.to.mockReturnValue({ emit: volatileEmit });

      gateway.onCursorMove(client as never, { x: 0.5, y: 0.25 });

      expect(client.volatile.to).toHaveBeenCalledWith(room('board-1'));
      expect(volatileEmit).toHaveBeenCalledWith('cursor:moved', {
        userId: 'user-1',
        x: 0.5,
        y: 0.25,
      });
    });
  });

  describe('onNoteCreate', () => {
    it('crea la nota, difunde a la sala y confirma al emisor con el ack', async () => {
      const client = aClient();
      notes.create.mockResolvedValue({ id: 'note-1' });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      const toEmit = jest.fn();
      client.to.mockReturnValue({ emit: toEmit });

      const ack = await gateway.onNoteCreate(client as never, {
        columnId: 'col-1',
        text: 'Hola',
        tempId: 'tmp-1',
      });

      expect(client.to).toHaveBeenCalledWith(room('board-1'));
      expect(toEmit).toHaveBeenCalledWith('note:created', {
        id: 'note-1',
        projection: 'others',
      });
      expect(ack).toEqual({
        ok: true,
        data: { note: { id: 'note-1', projection: 'author' }, tempId: 'tmp-1' },
      });
    });

    it('devuelve un ack de error cuando el servicio rechaza', async () => {
      const client = aClient();
      notes.create.mockRejectedValue(
        new WsException({ code: 'BOARD_ARCHIVED', message: 'nope' }),
      );

      const ack = await gateway.onNoteCreate(client as never, {
        columnId: 'col-1',
        text: 'Hola',
        tempId: 'tmp-1',
      });

      expect(ack).toEqual({
        ok: false,
        error: { code: 'BOARD_ARCHIVED', message: 'nope', meta: undefined },
      });
    });
  });

  describe('onNoteUpdate', () => {
    it('actualiza y difunde la proyección para terceros', async () => {
      const client = aClient();
      notes.update.mockResolvedValue({ id: 'note-1' });
      boards.findByIdOrFail.mockResolvedValue({ id: 'board-1' });
      const toEmit = jest.fn();
      client.to.mockReturnValue({ emit: toEmit });

      const ack = await gateway.onNoteUpdate(client as never, {
        noteId: 'note-1',
        text: 'Editada',
        version: 1,
      });

      expect(toEmit).toHaveBeenCalledWith('note:updated', {
        id: 'note-1',
        projection: 'others',
      });
      expect(ack.ok).toBe(true);
    });
  });

  describe('onNoteMove', () => {
    it('mueve la nota y difunde note:moved', async () => {
      const client = aClient();
      notes.move.mockResolvedValue({
        id: 'note-1',
        columnId: 'col-2',
        position: 2,
        version: 2,
      });
      const toEmit = jest.fn();
      client.to.mockReturnValue({ emit: toEmit });

      const ack = await gateway.onNoteMove(client as never, {
        noteId: 'note-1',
        columnId: 'col-2',
        position: 2,
        version: 1,
      });

      expect(toEmit).toHaveBeenCalledWith('note:moved', {
        noteId: 'note-1',
        columnId: 'col-2',
        position: 2,
        version: 2,
      });
      expect(ack.ok).toBe(true);
    });
  });

  describe('onNoteDelete', () => {
    it('elimina la nota y difunde note:deleted', async () => {
      const client = aClient();
      notes.remove.mockResolvedValue(undefined);
      const toEmit = jest.fn();
      client.to.mockReturnValue({ emit: toEmit });

      const ack = await gateway.onNoteDelete(client as never, {
        noteId: 'note-1',
      });

      expect(notes.remove).toHaveBeenCalledWith(
        'board-1',
        'user-1',
        'member',
        'note-1',
      );
      expect(toEmit).toHaveBeenCalledWith('note:deleted', { noteId: 'note-1' });
      expect(ack).toEqual({ ok: true, data: undefined });
    });
  });

  describe('onVoteCast', () => {
    it('vota, confirma al emisor y no difunde tally si liveTally es false', async () => {
      const client = aClient();
      votes.cast.mockResolvedValue({ remaining: 2, count: 1 });
      boards.findByIdOrFail.mockResolvedValue({
        id: 'board-1',
        liveTally: false,
      });

      const ack = await gateway.onVoteCast(client as never, {
        noteId: 'note-1',
      });

      expect(votes.cast).toHaveBeenCalledWith('board-1', 'note-1', 'user-1');
      expect(client.emit).toHaveBeenCalledWith('vote:my-update', {
        noteId: 'note-1',
        count: 1,
        remaining: 2,
      });
      expect(votes.tally).not.toHaveBeenCalled();
      expect(ack).toEqual({ ok: true, data: { remaining: 2 } });
    });

    it('difunde vote:tally a la sala cuando liveTally es true', async () => {
      const client = aClient();
      votes.cast.mockResolvedValue({ remaining: 1, count: 1 });
      boards.findByIdOrFail.mockResolvedValue({
        id: 'board-1',
        liveTally: true,
      });
      votes.tally.mockResolvedValue({ 'note-1': 3 });
      const serverEmit = jest.fn();
      server.to.mockReturnValue({ emit: serverEmit });

      await gateway.onVoteCast(client as never, { noteId: 'note-1' });

      expect(server.to).toHaveBeenCalledWith(room('board-1'));
      expect(serverEmit).toHaveBeenCalledWith('vote:tally', {
        tally: { 'note-1': 3 },
      });
    });

    it('difunde vote:tally a la sala cuando el board ya está revealed aunque liveTally sea false', async () => {
      const client = aClient();
      votes.cast.mockResolvedValue({ remaining: 1, count: 1 });
      boards.findByIdOrFail.mockResolvedValue({
        id: 'board-1',
        liveTally: false,
        revealed: true,
      });
      votes.tally.mockResolvedValue({ 'note-1': 2 });
      const serverEmit = jest.fn();
      server.to.mockReturnValue({ emit: serverEmit });

      await gateway.onVoteCast(client as never, { noteId: 'note-1' });

      expect(server.to).toHaveBeenCalledWith(room('board-1'));
      expect(serverEmit).toHaveBeenCalledWith('vote:tally', {
        tally: { 'note-1': 2 },
      });
    });

    it('devuelve un ack de error cuando el presupuesto está agotado', async () => {
      const client = aClient();
      votes.cast.mockRejectedValue(
        new WsException({
          code: 'BUDGET_EXCEEDED',
          message: 'nope',
          meta: { budget: 3, spent: 3 },
        }),
      );

      const ack = await gateway.onVoteCast(client as never, {
        noteId: 'note-1',
      });

      expect(ack).toEqual({
        ok: false,
        error: {
          code: 'BUDGET_EXCEEDED',
          message: 'nope',
          meta: { budget: 3, spent: 3 },
        },
      });
    });
  });

  describe('onVoteRetract', () => {
    it('retira el voto y confirma al emisor', async () => {
      const client = aClient();
      votes.retract.mockResolvedValue({ remaining: 3, count: 0 });
      boards.findByIdOrFail.mockResolvedValue({
        id: 'board-1',
        liveTally: false,
      });

      const ack = await gateway.onVoteRetract(client as never, {
        noteId: 'note-1',
      });

      expect(votes.retract).toHaveBeenCalledWith('board-1', 'note-1', 'user-1');
      expect(client.emit).toHaveBeenCalledWith('vote:my-update', {
        noteId: 'note-1',
        count: 0,
        remaining: 3,
      });
      expect(ack).toEqual({ ok: true, data: { remaining: 3 } });
    });
  });

  describe('onSessionChangePhase', () => {
    it('cambia de fase y difunde a toda la sala, incluido el emisor', async () => {
      const client = aClient();
      session.changePhase.mockResolvedValue({
        phase: 'GROUPING',
        revealed: false,
      });
      const serverEmit = jest.fn();
      server.to.mockReturnValue({ emit: serverEmit });

      const ack = await gateway.onSessionChangePhase(client as never, {
        phase: 'GROUPING',
      });

      expect(session.changePhase).toHaveBeenCalledWith(
        'board-1',
        'user-1',
        'GROUPING',
      );
      expect(server.to).toHaveBeenCalledWith(room('board-1'));
      expect(serverEmit).toHaveBeenCalledWith('session:phase-changed', {
        phase: 'GROUPING',
        revealed: false,
      });
      expect(ack).toEqual({ ok: true, data: undefined });
    });

    it('devuelve un ack de error en una transición inválida', async () => {
      const client = aClient();
      session.changePhase.mockRejectedValue(
        new WsException({
          code: 'INVALID_TRANSITION',
          message: 'nope',
          meta: { from: 'COLLECTING', to: 'DISCUSSING' },
        }),
      );

      const ack = await gateway.onSessionChangePhase(client as never, {
        phase: 'DISCUSSING',
      });

      expect(ack.ok).toBe(false);
    });
  });

  describe('onSessionStartTimer', () => {
    it('inicia el temporizador y difunde session:timer-updated', async () => {
      const client = aClient();
      session.startTimer.mockResolvedValue({ endsAt: '2026-01-01T00:01:00Z' });
      const serverEmit = jest.fn();
      server.to.mockReturnValue({ emit: serverEmit });

      const ack = await gateway.onSessionStartTimer(client as never, {
        durationSeconds: 60,
      });

      expect(session.startTimer).toHaveBeenCalledWith('board-1', 'user-1', 60);
      expect(serverEmit).toHaveBeenCalledWith('session:timer-updated', {
        endsAt: '2026-01-01T00:01:00Z',
        paused: false,
      });
      expect(ack).toEqual({
        ok: true,
        data: { endsAt: '2026-01-01T00:01:00Z' },
      });
    });
  });

  describe('onSessionPauseTimer', () => {
    it('pausa el temporizador y difunde el estado congelado', async () => {
      const client = aClient();
      session.pauseTimer.mockResolvedValue({
        endsAt: null,
        paused: true,
        remainingMs: 4000,
      });
      const serverEmit = jest.fn();
      server.to.mockReturnValue({ emit: serverEmit });

      const ack = await gateway.onSessionPauseTimer(client as never);

      expect(session.pauseTimer).toHaveBeenCalledWith('board-1', 'user-1');
      expect(serverEmit).toHaveBeenCalledWith('session:timer-updated', {
        endsAt: null,
        paused: true,
        remainingMs: 4000,
      });
      expect(ack).toEqual({ ok: true, data: undefined });
    });
  });

  describe('onSessionCancelTimer', () => {
    it('cancela el temporizador y difunde el estado limpio', async () => {
      const client = aClient();
      session.cancelTimer.mockResolvedValue({ endsAt: null, paused: false });
      const serverEmit = jest.fn();
      server.to.mockReturnValue({ emit: serverEmit });

      const ack = await gateway.onSessionCancelTimer(client as never);

      expect(session.cancelTimer).toHaveBeenCalledWith('board-1', 'user-1');
      expect(serverEmit).toHaveBeenCalledWith('session:timer-updated', {
        endsAt: null,
        paused: false,
      });
      expect(ack).toEqual({ ok: true, data: undefined });
    });
  });

  describe('onSessionReveal', () => {
    it('difunde board:revealed y reconstruye board:sync por cada socket conectado', async () => {
      const client = aClient();
      session.reveal.mockResolvedValue({ id: 'board-1', revealed: true });
      const revealEmit = jest.fn();
      server.to.mockReturnValue({ emit: revealEmit });

      const socketA = {
        data: { user: { id: 'user-1' }, role: 'owner' },
        emit: jest.fn(),
      };
      const socketB = {
        data: { user: { id: 'user-2' }, role: 'member' },
        emit: jest.fn(),
      };
      server.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([socketA, socketB]),
      });
      snapshot.build.mockImplementation((_boardId, viewerId) => ({
        board: {},
        myRole: viewerId,
      }));

      const ack = await gateway.onSessionReveal(client as never);

      expect(session.reveal).toHaveBeenCalledWith('board-1', 'user-1');
      expect(server.to).toHaveBeenCalledWith(room('board-1'));
      expect(revealEmit).toHaveBeenCalledWith('board:revealed', {
        revealed: true,
      });
      expect(server.in).toHaveBeenCalledWith(room('board-1'));
      expect(snapshot.build).toHaveBeenCalledWith('board-1', 'user-1', 'owner');
      expect(snapshot.build).toHaveBeenCalledWith(
        'board-1',
        'user-2',
        'member',
      );
      expect(socketA.emit).toHaveBeenCalledWith(
        'board:sync',
        expect.objectContaining({ myRole: 'user-1' }),
      );
      expect(socketB.emit).toHaveBeenCalledWith(
        'board:sync',
        expect.objectContaining({ myRole: 'user-2' }),
      );
      expect(ack).toEqual({ ok: true, data: undefined });
    });

    it('ignora sockets sin datos de autenticación completos', async () => {
      const client = aClient();
      session.reveal.mockResolvedValue({ id: 'board-1', revealed: true });
      server.to.mockReturnValue({ emit: jest.fn() });
      const incompleteSocket = { data: {}, emit: jest.fn() };
      server.in.mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([incompleteSocket]),
      });

      await gateway.onSessionReveal(client as never);

      expect(snapshot.build).not.toHaveBeenCalled();
      expect(incompleteSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('onMemberKick', () => {
    it('expulsa al miembro y desconecta todos sus sockets', async () => {
      const client = aClient();
      session.kick.mockResolvedValue(undefined);
      presence.socketIdsFor.mockReturnValue(['socket-a', 'socket-b']);
      const targetA = { emit: jest.fn(), disconnect: jest.fn() };
      const targetB = { emit: jest.fn(), disconnect: jest.fn() };
      server.sockets.sockets.set('socket-a', targetA);
      server.sockets.sockets.set('socket-b', targetB);

      const ack = await gateway.onMemberKick(client as never, {
        userId: 'user-2',
      });

      expect(session.kick).toHaveBeenCalledWith('board-1', 'user-1', 'user-2');
      expect(presence.socketIdsFor).toHaveBeenCalledWith('board-1', 'user-2');
      for (const target of [targetA, targetB]) {
        expect(target.emit).toHaveBeenCalledWith('board:kicked', {
          reason: 'KICKED_BY_OWNER',
        });
        expect(target.disconnect).toHaveBeenCalledWith(true);
      }
      expect(ack).toEqual({ ok: true, data: undefined });
    });

    it('devuelve un ack de error cuando el owner intenta expulsarse a sí mismo', async () => {
      const client = aClient();
      session.kick.mockRejectedValue(
        new WsException({ code: 'FORBIDDEN_ROLE', message: 'nope' }),
      );

      const ack = await gateway.onMemberKick(client as never, {
        userId: 'user-1',
      });

      expect(ack.ok).toBe(false);
    });

    it('no falla si el socket ya se desconectó antes del kick', async () => {
      const client = aClient();
      session.kick.mockResolvedValue(undefined);
      presence.socketIdsFor.mockReturnValue(['socket-gone']);

      const ack = await gateway.onMemberKick(client as never, {
        userId: 'user-2',
      });

      expect(ack).toEqual({ ok: true, data: undefined });
    });
  });

  describe('onActionItemCreate', () => {
    it('crea el action item y difunde action-item:created', async () => {
      const client = aClient({ role: 'owner' });
      actionItems.create.mockResolvedValue({
        id: 'item-1',
        text: 'Follow up',
        assigneeId: null,
        status: 'open',
        createdBy: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const toEmit = jest.fn();
      client.to.mockReturnValue({ emit: toEmit });

      const ack = await gateway.onActionItemCreate(client as never, {
        text: 'Follow up',
      });

      expect(actionItems.create).toHaveBeenCalledWith('board-1', 'user-1', {
        text: 'Follow up',
      });
      expect(toEmit).toHaveBeenCalledWith(
        'action-item:created',
        expect.objectContaining({ id: 'item-1', status: 'open' }),
      );
      expect(ack).toEqual({
        ok: true,
        data: {
          item: expect.objectContaining({ id: 'item-1' }) as unknown,
        },
      });
    });

    it('devuelve un ack de error cuando el service rechaza', async () => {
      const client = aClient({ role: 'member' });
      actionItems.create.mockRejectedValue(
        new WsException({ code: 'FORBIDDEN_ROLE', message: 'nope' }),
      );

      const ack = await gateway.onActionItemCreate(client as never, {
        text: 'Follow up',
      });

      expect(ack.ok).toBe(false);
    });
  });

  describe('onActionItemUpdate', () => {
    it('actualiza el action item y difunde action-item:updated', async () => {
      const client = aClient({ role: 'owner' });
      actionItems.update.mockResolvedValue({
        id: 'item-1',
        text: 'Follow up',
        assigneeId: null,
        status: 'done',
        createdBy: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const toEmit = jest.fn();
      client.to.mockReturnValue({ emit: toEmit });

      const ack = await gateway.onActionItemUpdate(client as never, {
        id: 'item-1',
        status: 'done',
      });

      expect(actionItems.update).toHaveBeenCalledWith('board-1', 'user-1', {
        id: 'item-1',
        status: 'done',
      });
      expect(toEmit).toHaveBeenCalledWith(
        'action-item:updated',
        expect.objectContaining({ id: 'item-1', status: 'done' }),
      );
      expect(ack.ok).toBe(true);
    });
  });

  describe('onActionItemDelete', () => {
    it('elimina el action item y difunde action-item:deleted', async () => {
      const client = aClient({ role: 'owner' });
      actionItems.remove.mockResolvedValue(undefined);
      const toEmit = jest.fn();
      client.to.mockReturnValue({ emit: toEmit });

      const ack = await gateway.onActionItemDelete(client as never, {
        id: 'item-1',
      });

      expect(actionItems.remove).toHaveBeenCalledWith(
        'board-1',
        'user-1',
        'item-1',
      );
      expect(toEmit).toHaveBeenCalledWith('action-item:deleted', {
        id: 'item-1',
      });
      expect(ack).toEqual({ ok: true, data: undefined });
    });
  });
});
