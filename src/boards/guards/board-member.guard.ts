import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { MembersService } from '../members.service';
import type { AuthenticatedRequest } from '../types/authenticated-request.interface';

@Injectable()
export class BoardMemberGuard implements CanActivate {
  constructor(private readonly members: MembersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const boardId = req.params.boardId as string;

    req.membership = await this.members.requireMembership(boardId, req.user.id);
    return true;
  }
}
