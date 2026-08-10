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
} from './dto';

export interface ClientEvents {
  'note:create': CreateNotePayload;
  'note:update': UpdateNotePayload;
  'note:move': MoveNotePayload;
  'note:delete': DeleteNotePayload;
}

export interface ServerEvents {
  'board:sync': BoardSnapshot;
  'note:created': NoteDto;
  'note:updated': NoteDto;
  'note:moved': NoteMovedPayload;
  'note:deleted': { noteId: string };
  'presence:updated': { participants: ParticipantDto[] };
  error: WsErrorPayload;
}

export type CreateNoteAck = Ack<{ note: NoteDto; tempId: string }>;
export type UpdateNoteAck = Ack<{ note: NoteDto }>;
export type MoveNoteAck = Ack<{ note: NoteMovedPayload }>;
export type DeleteNoteAck = Ack<void>;

export const CONTRACTS_VERSION = '1.0.0';
