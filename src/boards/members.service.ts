import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardMember, BoardRole } from './entities/board-member.entity';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(BoardMember)
    private readonly members: Repository<BoardMember>,
  ) {}

  findMembership(boardId: string, userId: string): Promise<BoardMember | null> {
    return this.members.findOneBy({ boardId, userId });
  }

  async requireMembership(
    boardId: string,
    userId: string,
  ): Promise<BoardMember> {
    const membership = await this.findMembership(boardId, userId);
    if (!membership) {
      throw new ForbiddenException({
        code: 'NOT_A_MEMBER',
        message: 'Not a member of this board.',
      });
    }
    return membership;
  }

  async requireRole(
    boardId: string,
    userId: string,
    role: BoardRole,
  ): Promise<BoardMember> {
    const membership = await this.requireMembership(boardId, userId);
    if (membership.role !== role) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: `This action requires the "${role}" role.`,
      });
    }
    return membership;
  }

  async addMember(
    boardId: string,
    userId: string,
    role: BoardRole = 'member',
  ): Promise<BoardMember> {
    const existing = await this.findMembership(boardId, userId);
    if (existing) return existing;

    const member = this.members.create({ boardId, userId, role });
    return this.members.save(member);
  }

  list(boardId: string): Promise<BoardMember[]> {
    return this.members.find({ where: { boardId }, relations: { user: true } });
  }
}
