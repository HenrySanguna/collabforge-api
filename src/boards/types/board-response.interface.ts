import type { BoardPhase } from '../entities/board.entity';
import type { BoardRole } from '../entities/board-member.entity';

export interface BoardColumnDto {
  id: string;
  title: string;
  color: string;
  position: number;
}

export interface BoardSummaryDto {
  id: string;
  slug: string;
  title: string;
  phase: BoardPhase;
  isArchived: boolean;
  myRole: BoardRole;
  updatedAt: string;
  createdAt: string;
}

export interface BoardDetailDto extends BoardSummaryDto {
  ownerId: string;
  revealed: boolean;
  voteBudget: number;
  allowMultiVote: boolean;
  liveTally: boolean;
  columns: BoardColumnDto[];
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface InviteLinkDto {
  token: string;
  expiresAt: string;
}
