import type { Ack, WsErrorPayload } from './errors';
import type {
  BoardSnapshot,
  CreateNotePayload,
  UpdateNotePayload,
  MoveNotePayload,
  DeleteNotePayload,
  NoteDto,
  NoteMovedPayload,
  ParticipantDto,
  CursorMovePayload,
  CursorMovedPayload,
  CastVotePayload,
  RetractVotePayload,
  ChangePhasePayload,
  StartTimerPayload,
  KickPayload,
  PhaseChangedPayload,
  TimerUpdatedPayload,
  VoteMyUpdatePayload,
} from './dto';

export interface ClientEvents {
  'note:create': CreateNotePayload;
  'note:update': UpdateNotePayload;
  'note:move': MoveNotePayload;
  'note:delete': DeleteNotePayload;
  'cursor:move': CursorMovePayload;
  'vote:cast': CastVotePayload;
  'vote:retract': RetractVotePayload;
  'session:change-phase': ChangePhasePayload;
  'session:start-timer': StartTimerPayload;
  'session:pause-timer': void;
  'session:cancel-timer': void;
  'session:reveal': void;
  'member:kick': KickPayload;
}

export interface ServerEvents {
  'board:sync': BoardSnapshot;
  'note:created': NoteDto;
  'note:updated': NoteDto;
  'note:moved': NoteMovedPayload;
  'note:deleted': { noteId: string };
  'presence:updated': { participants: ParticipantDto[] };
  'cursor:moved': CursorMovedPayload;
  'session:phase-changed': PhaseChangedPayload;
  'session:timer-updated': TimerUpdatedPayload;
  'board:revealed': { revealed: true };
  'board:kicked': { reason: 'KICKED_BY_OWNER' };
  'vote:tally': { tally: Record<string, number> };
  'vote:my-update': VoteMyUpdatePayload;
  error: WsErrorPayload;
}

export type CreateNoteAck = Ack<{ note: NoteDto; tempId: string }>;
export type UpdateNoteAck = Ack<{ note: NoteDto }>;
export type MoveNoteAck = Ack<{ note: NoteMovedPayload }>;
export type DeleteNoteAck = Ack<void>;
export type CastVoteAck = Ack<{ remaining: number }>;
export type RetractVoteAck = Ack<{ remaining: number }>;
export type StartTimerAck = Ack<{ endsAt: string }>;

export const CONTRACTS_VERSION = '1.2.0';
