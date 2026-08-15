import type { Socket } from 'socket.io';
import type { AuthUser } from '../../auth/types/auth-user.interface';
import type { BoardRole } from '../../boards/entities/board-member.entity';
import type { ClientEvents, ServerEvents } from '../../contracts';

export interface SocketData {
  user: AuthUser;
  boardId: string;
  role: BoardRole;
  /** Correlation root for this connection's lifetime; seeded on connect, reused by every WS event's correlationId. */
  rootId?: string;
  /** `Date.now()` at successful `handleConnection`, used to compute board session duration on disconnect. */
  connectedAt?: number;
}

// Socket.IO tipa sus eventos como firmas de listener; los contratos
// describen solo la forma del payload, así que se adaptan aquí.
type EventMap<T> = { [K in keyof T]: (payload: T[K]) => void };

export type AuthenticatedSocket = Socket<
  EventMap<ClientEvents>,
  EventMap<ServerEvents>,
  Record<string, never>,
  Partial<SocketData>
>;
