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
  };
  let server: { to: jest.Mock };

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
    };

    gateway = new BoardGateway(
      wsAuth as unknown as WsAuthService,
      members as unknown as MembersService,
      boards as unknown as BoardsService,
      notes as unknown as NotesService,
      serializer as unknown as NoteSerializerService,
      snapshot as unknown as BoardSnapshotService,
      presence as unknown as PresenceService,
    );

    server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
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
});
