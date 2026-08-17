import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { createTestApp, TestContext } from '../utils/create-test-app';
import { registerUser, createBoard } from '../utils/fixtures';
import type {
  Ack,
  ActionItemDto,
  BoardSnapshot,
  NoteDto,
  NoteMovedPayload,
  ParticipantDto,
  VoteMyUpdatePayload,
  WsErrorPayload,
} from '../../src/contracts';

async function inviteAndJoin(
  url: string,
  ownerToken: string,
  boardId: string,
  memberToken: string,
): Promise<void> {
  const invite = await request(url)
    .post(`/api/boards/${boardId}/invite`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .expect(201);

  await request(url)
    .post('/api/invitations/accept')
    .set('Authorization', `Bearer ${memberToken}`)
    .send({ token: invite.body.token as string })
    .expect(200);
}

function connectBoardSocket(
  url: string,
  token: string,
  boardId: string,
): Socket {
  return io(`${url}/board`, {
    auth: { token },
    query: { boardId },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
  });
}

function emitWithAck<TData>(
  socket: Socket,
  event: string,
  payload: Record<string, unknown>,
): Promise<Ack<TData>> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (ack: Ack<TData>) => resolve(ack));
  });
}

function expectOk<T>(ack: Ack<T>): T {
  if (!ack.ok) {
    throw new Error(`Expected ok ack, got error: ${ack.error.code}`);
  }
  return ack.data;
}

async function connectAndSync(
  url: string,
  token: string,
  boardId: string,
): Promise<{ socket: Socket; snapshot: BoardSnapshot }> {
  const socket = connectBoardSocket(url, token, boardId);
  const snapshot = await waitForEvent<BoardSnapshot>(socket, 'board:sync');
  return { socket, snapshot };
}

// Confirmar la AUSENCIA de un evento no se puede esperar con una promesa: se
// deja un margen acotado para el viaje de ida y vuelta por la red antes de
// verificar que el contador no se movió.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Realtime board gateway (e2e)', () => {
  let ctx: TestContext;
  let sockets: Socket[];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    sockets = [];
    await ctx.dataSource.query(
      `TRUNCATE users, refresh_tokens, boards, board_columns, board_members, notes, votes, action_items RESTART IDENTITY CASCADE;`,
    );
  });

  afterEach(() => {
    for (const socket of sockets) {
      if (socket.connected) socket.disconnect();
    }
  });

  it('propaga eventos de notas (crear/editar/mover/eliminar) entre dos clientes conectados', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');
    await inviteAndJoin(ctx.url, ana.token, board.id, bruno.token);

    const columns: { id: string }[] = await ctx.dataSource.query(
      `SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
      [board.id],
    );
    const [columnStart, columnStop] = columns;

    const { socket: anaSocket } = await connectAndSync(
      ctx.url,
      ana.token,
      board.id,
    );
    const { socket: brunoSocket } = await connectAndSync(
      ctx.url,
      bruno.token,
      board.id,
    );
    sockets.push(anaSocket, brunoSocket);

    const createdOnBruno = waitForEvent<NoteDto>(brunoSocket, 'note:created');
    const createAck = await emitWithAck<{ note: NoteDto; tempId: string }>(
      anaSocket,
      'note:create',
      { columnId: columnStart.id, text: 'Nota original', tempId: 'tmp-1' },
    );
    const { note: createdNote } = expectOk(createAck);
    const noteId = createdNote.id;
    expect((await createdOnBruno).id).toBe(noteId);

    const updatedOnBruno = waitForEvent<NoteDto>(brunoSocket, 'note:updated');
    const updateAck = await emitWithAck<{ note: NoteDto }>(
      anaSocket,
      'note:update',
      { noteId, text: 'Nota editada', version: createdNote.version },
    );
    expectOk(updateAck);
    expect((await updatedOnBruno).text).toBe('Nota editada');

    const phaseChangeAck = await emitWithAck<void>(
      anaSocket,
      'session:change-phase',
      {
        phase: 'GROUPING',
      },
    );
    expectOk(phaseChangeAck);

    const movedOnBruno = waitForEvent<NoteMovedPayload>(
      brunoSocket,
      'note:moved',
    );
    const moveAck = await emitWithAck<{ note: NoteMovedPayload }>(
      anaSocket,
      'note:move',
      {
        noteId,
        columnId: columnStop.id,
        position: 0,
        version: createdNote.version + 1,
      },
    );
    const { note: movedNote } = expectOk(moveAck);
    expect(movedNote.columnId).toBe(columnStop.id);
    const moved = await movedOnBruno;
    expect(moved.columnId).toBe(columnStop.id);

    const deletedOnBruno = waitForEvent<{ noteId: string }>(
      brunoSocket,
      'note:deleted',
    );
    const deleteAck = await emitWithAck<void>(anaSocket, 'note:delete', {
      noteId,
    });
    expectOk(deleteAck);
    expect((await deletedOnBruno).noteId).toBe(noteId);
  });

  it('al reconectar, el snapshot recibido refleja el estado actual del tablero', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');
    await inviteAndJoin(ctx.url, ana.token, board.id, bruno.token);

    const columns: { id: string }[] = await ctx.dataSource.query(
      `SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
      [board.id],
    );
    const [columnStart] = columns;

    const { socket: anaSocket } = await connectAndSync(
      ctx.url,
      ana.token,
      board.id,
    );
    const { socket: brunoSocket, snapshot: brunoInitialSnapshot } =
      await connectAndSync(ctx.url, bruno.token, board.id);
    sockets.push(anaSocket, brunoSocket);
    expect(brunoInitialSnapshot.notes).toHaveLength(0);

    const brunoLeft = waitForEvent<{ participants: ParticipantDto[] }>(
      anaSocket,
      'presence:updated',
    );
    brunoSocket.disconnect();
    await brunoLeft;

    const createAck = await emitWithAck<{ note: NoteDto; tempId: string }>(
      anaSocket,
      'note:create',
      {
        columnId: columnStart.id,
        text: 'Creada mientras Bruno estaba offline',
        tempId: 'tmp-1',
      },
    );
    const { note: createdNote } = expectOk(createAck);

    // Ambos listeners se registran antes de conectar: si esperáramos a que
    // resuelva board:sync para recién escuchar presence:updated, ese evento
    // (emitido justo después, sobre el mismo socket) podría llegar sin nadie
    // escuchando y perderse para siempre.
    const brunoReconnected = connectBoardSocket(ctx.url, bruno.token, board.id);
    sockets.push(brunoReconnected);
    const brunoReconnectSnapshotPromise = waitForEvent<BoardSnapshot>(
      brunoReconnected,
      'board:sync',
    );
    const presenceAfterRejoinPromise = waitForEvent<{
      participants: ParticipantDto[];
    }>(brunoReconnected, 'presence:updated');

    const brunoReconnectSnapshot = await brunoReconnectSnapshotPromise;
    expect(brunoReconnectSnapshot.notes).toHaveLength(1);
    expect(brunoReconnectSnapshot.notes[0].id).toBe(createdNote.id);
    // El snapshot se construye y se envía antes de registrar la propia presencia
    // (ver board.gateway.ts#handleConnection), así que en su propio board:sync
    // Bruno todavía no se ve a sí mismo como participante.
    expect(brunoReconnectSnapshot.participants.map((p) => p.userId)).toEqual([
      ana.userId,
    ]);

    const presenceAfterRejoin = await presenceAfterRejoinPromise;
    expect(
      presenceAfterRejoin.participants.map((p) => p.userId).sort(),
    ).toEqual([ana.userId, bruno.userId].sort());
  });

  it('doble pestaña del mismo usuario: la sala llega a ambas pero los emits dirigidos solo llegan al socket emisor', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');
    await inviteAndJoin(ctx.url, ana.token, board.id, bruno.token);

    const columns: { id: string }[] = await ctx.dataSource.query(
      `SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
      [board.id],
    );
    const [columnStart] = columns;

    const { socket: anaSocket } = await connectAndSync(
      ctx.url,
      ana.token,
      board.id,
    );
    sockets.push(anaSocket);

    const firstTabPresence = waitForEvent<{ participants: ParticipantDto[] }>(
      anaSocket,
      'presence:updated',
    );
    const { socket: brunoTab1 } = await connectAndSync(
      ctx.url,
      bruno.token,
      board.id,
    );
    sockets.push(brunoTab1);
    await firstTabPresence;

    let extraPresenceUpdates = 0;
    anaSocket.on('presence:updated', () => {
      extraPresenceUpdates += 1;
    });
    const { socket: brunoTab2 } = await connectAndSync(
      ctx.url,
      bruno.token,
      board.id,
    );
    sockets.push(brunoTab2);
    await wait(200);
    expect(extraPresenceUpdates).toBe(0);

    const tab2SawCreatedNote = waitForEvent<NoteDto>(brunoTab2, 'note:created');
    const createAck = await emitWithAck<{ note: NoteDto; tempId: string }>(
      brunoTab1,
      'note:create',
      { columnId: columnStart.id, text: 'Nota de Bruno', tempId: 'tmp-1' },
    );
    const { note: createdNote } = expectOk(createAck);
    expect((await tab2SawCreatedNote).id).toBe(createdNote.id);

    expectOk(
      await emitWithAck<void>(anaSocket, 'session:change-phase', {
        phase: 'GROUPING',
      }),
    );
    expectOk(
      await emitWithAck<void>(anaSocket, 'session:change-phase', {
        phase: 'VOTING',
      }),
    );

    const tab1VoteUpdate = waitForEvent<VoteMyUpdatePayload>(
      brunoTab1,
      'vote:my-update',
    );
    let tab2SawVoteUpdate = false;
    brunoTab2.on('vote:my-update', () => {
      tab2SawVoteUpdate = true;
    });

    const voteAck = await emitWithAck<{ remaining: number }>(
      brunoTab1,
      'vote:cast',
      {
        noteId: createdNote.id,
      },
    );
    expectOk(voteAck);
    expect((await tab1VoteUpdate).noteId).toBe(createdNote.id);

    await wait(200);
    expect(tab2SawVoteUpdate).toBe(false);
  });

  describe('action items', () => {
    async function boardInDiscussing(socket: Socket): Promise<void> {
      for (const phase of ['GROUPING', 'VOTING', 'DISCUSSING']) {
        expectOk(
          await emitWithAck<void>(socket, 'session:change-phase', { phase }),
        );
      }
    }

    it('el owner crea/actualiza/elimina y los cambios se propagan a otros clientes', async () => {
      const ana = await registerUser(ctx.url, 'ana@test.com');
      const bruno = await registerUser(ctx.url, 'bruno@test.com');
      const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');
      await inviteAndJoin(ctx.url, ana.token, board.id, bruno.token);

      const { socket: anaSocket } = await connectAndSync(
        ctx.url,
        ana.token,
        board.id,
      );
      const { socket: brunoSocket } = await connectAndSync(
        ctx.url,
        bruno.token,
        board.id,
      );
      sockets.push(anaSocket, brunoSocket);

      await boardInDiscussing(anaSocket);

      const createdOnBruno = waitForEvent<ActionItemDto>(
        brunoSocket,
        'action-item:created',
      );
      const createAck = await emitWithAck<{ item: ActionItemDto }>(
        anaSocket,
        'action-item:create',
        { text: 'Seguimiento con diseño' },
      );
      const { item: created } = expectOk(createAck);
      expect(created.status).toBe('open');
      expect(created.createdBy).toBe(ana.userId);
      expect((await createdOnBruno).id).toBe(created.id);

      const updatedOnBruno = waitForEvent<ActionItemDto>(
        brunoSocket,
        'action-item:updated',
      );
      const updateAck = await emitWithAck<{ item: ActionItemDto }>(
        anaSocket,
        'action-item:update',
        { id: created.id, status: 'done' },
      );
      expect(expectOk(updateAck).item.status).toBe('done');
      expect((await updatedOnBruno).status).toBe('done');

      const deletedOnBruno = waitForEvent<{ id: string }>(
        brunoSocket,
        'action-item:deleted',
      );
      const deleteAck = await emitWithAck<void>(
        anaSocket,
        'action-item:delete',
        {
          id: created.id,
        },
      );
      expectOk(deleteAck);
      expect((await deletedOnBruno).id).toBe(created.id);
    });

    it('un miembro no-owner recibe FORBIDDEN_ROLE al intentar mutar action items', async () => {
      const ana = await registerUser(ctx.url, 'ana@test.com');
      const bruno = await registerUser(ctx.url, 'bruno@test.com');
      const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');
      await inviteAndJoin(ctx.url, ana.token, board.id, bruno.token);

      const { socket: anaSocket } = await connectAndSync(
        ctx.url,
        ana.token,
        board.id,
      );
      const { socket: brunoSocket } = await connectAndSync(
        ctx.url,
        bruno.token,
        board.id,
      );
      sockets.push(anaSocket, brunoSocket);

      await boardInDiscussing(anaSocket);

      const ack = await emitWithAck<{ item: ActionItemDto }>(
        brunoSocket,
        'action-item:create',
        { text: 'No debería crearse' },
      );
      expect(ack.ok).toBe(false);
      if (!ack.ok) expect(ack.error.code).toBe('FORBIDDEN_ROLE');
    });

    it('el owner recibe PHASE_NOT_ALLOWED fuera de DISCUSSING', async () => {
      const ana = await registerUser(ctx.url, 'ana@test.com');
      const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');

      const { socket: anaSocket } = await connectAndSync(
        ctx.url,
        ana.token,
        board.id,
      );
      sockets.push(anaSocket);

      // El tablero sigue en COLLECTING (fase inicial). El rechazo ocurre en
      // PhaseGuard, ANTES del handler: WsExceptionFilter solo emite 'error'
      // global, nunca resuelve el ack del emisor (mismo comportamiento que
      // el resto de acciones con @AllowedPhases, p. ej. note:create).
      const errorEvent = waitForEvent<WsErrorPayload>(anaSocket, 'error');
      anaSocket.emit('action-item:create', { text: 'Todavía no' });

      const error = await errorEvent;
      expect(error.code).toBe('PHASE_NOT_ALLOWED');
    });
  });
});
