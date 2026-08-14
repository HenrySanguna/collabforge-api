export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_A_MEMBER'
  | 'BOARD_NOT_FOUND'
  | 'BOARD_ARCHIVED'
  | 'PHASE_NOT_ALLOWED'
  | 'BOARD_LIMIT_REACHED'
  | 'FORBIDDEN_ROLE'
  | 'VERSION_CONFLICT'
  | 'NOTE_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONNECTION_REJECTED'
  | 'INVALID_TRANSITION'
  | 'BUDGET_EXCEEDED'
  | 'ALREADY_VOTED'
  | 'INTERNAL_ERROR';

export interface WsErrorPayload {
  code: ErrorCode;
  message: string;
  meta?: unknown;
}

export type Ack<T = void> =
  { ok: true; data: T } | { ok: false; error: WsErrorPayload };
