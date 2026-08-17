import type {
  AuthenticatedSocket,
  SocketData,
} from './types/authenticated-socket.interface';

export function requireSocketData(client: AuthenticatedSocket): SocketData {
  const { user, boardId, role } = client.data;
  if (!user || !boardId || !role) {
    throw new Error('Socket used before authentication completed.');
  }
  return { user, boardId, role };
}
