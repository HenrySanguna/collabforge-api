import type { Request } from 'express';
import type { AuthUser } from '../../auth/types/auth-user.interface';
import type { BoardMember } from '../entities/board-member.entity';

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  membership?: BoardMember;
}
