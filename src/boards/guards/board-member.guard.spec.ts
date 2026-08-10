import type { ExecutionContext } from '@nestjs/common';
import { BoardMemberGuard } from './board-member.guard';
import { MembersService } from '../members.service';

describe('BoardMemberGuard', () => {
  it('adjunta la membresía a la request y permite el paso', async () => {
    const members = {
      requireMembership: jest.fn().mockResolvedValue({ role: 'member' }),
    };
    const guard = new BoardMemberGuard(members as unknown as MembersService);

    const req = { params: { boardId: 'board-1' }, user: { id: 'user-1' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(members.requireMembership).toHaveBeenCalledWith('board-1', 'user-1');
    expect(req).toHaveProperty('membership', { role: 'member' });
  });

  it('propaga el rechazo cuando no hay membresía', async () => {
    const members = {
      requireMembership: jest.fn().mockRejectedValue(new Error('forbidden')),
    };
    const guard = new BoardMemberGuard(members as unknown as MembersService);

    const req = { params: { boardId: 'board-1' }, user: { id: 'user-1' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toThrow('forbidden');
  });
});
