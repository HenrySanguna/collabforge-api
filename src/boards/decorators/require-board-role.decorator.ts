import { SetMetadata } from '@nestjs/common';
import type { BoardRole } from '../entities/board-member.entity';

export const BOARD_ROLE_KEY = 'boardRole';

export const RequireBoardRole = (role: BoardRole) =>
  SetMetadata(BOARD_ROLE_KEY, role);
