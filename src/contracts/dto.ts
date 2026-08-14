export type BoardPhase = 'COLLECTING' | 'GROUPING' | 'VOTING' | 'DISCUSSING';
export type BoardRole = 'owner' | 'member';

export interface AuthorDto {
  userId: string;
  name: string;
  avatarColor: string;
}

export interface NoteDto {
  id: string;
  columnId: string;
  text: string;
  position: number;
  groupId: string | null;
  version: number;
  isDiscussed: boolean;
  author: AuthorDto | null;
  createdAt: string;
}

export interface ColumnDto {
  id: string;
  title: string;
  color: string;
  position: number;
}

export interface ParticipantDto {
  userId: string;
  name: string;
  avatarColor: string;
  role: BoardRole;
  isOnline: true;
}

export interface ActionItemDto {
  id: string;
  text: string;
  isDone: boolean;
}

export interface BoardSnapshot {
  board: {
    id: string;
    slug: string;
    title: string;
    phase: BoardPhase;
    revealed: boolean;
    voteBudget: number;
    allowMultiVote: boolean;
    liveTally: boolean;
    timerEndsAt: string | null;
    isArchived: boolean;
    ownerId: string;
  };
  columns: ColumnDto[];
  notes: NoteDto[];
  myVotes: Record<string, number>;
  tally: Record<string, number> | null;
  participants: ParticipantDto[];
  actionItems: ActionItemDto[];
  myRole: BoardRole;
  serverTime: string;
}

export interface CreateNotePayload {
  columnId: string;
  text: string;
  tempId: string;
}

export interface UpdateNotePayload {
  noteId: string;
  text: string;
  version: number;
}

export interface MoveNotePayload {
  noteId: string;
  columnId: string;
  position: number;
  version: number;
}

export interface DeleteNotePayload {
  noteId: string;
}

export interface NoteMovedPayload {
  noteId: string;
  columnId: string;
  position: number;
  version: number;
}

export interface CursorMovePayload {
  x: number;
  y: number;
}

export interface CursorMovedPayload {
  userId: string;
  x: number;
  y: number;
}

export interface CastVotePayload {
  noteId: string;
}

export interface RetractVotePayload {
  noteId: string;
}

export interface ChangePhasePayload {
  phase: BoardPhase;
}

export interface StartTimerPayload {
  durationSeconds: number;
}

export interface KickPayload {
  userId: string;
}

export interface PhaseChangedPayload {
  phase: BoardPhase;
  revealed: boolean;
}

export interface TimerUpdatedPayload {
  endsAt: string | null;
  paused: boolean;
  remainingMs?: number;
}

export interface VoteMyUpdatePayload {
  noteId: string;
  count: number;
  remaining: number;
}
