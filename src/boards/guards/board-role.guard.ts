import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BOARD_ROLE_KEY } from '../decorators/require-board-role.decorator';
import type { BoardRole } from '../entities/board-member.entity';
import type { AuthenticatedRequest } from '../types/authenticated-request.interface';

@Injectable()
export class BoardRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.get<BoardRole | undefined>(
      BOARD_ROLE_KEY,
      ctx.getHandler(),
    );
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.membership?.role !== required) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: `This action requires the "${required}" role.`,
      });
    }
    return true;
  }
}
