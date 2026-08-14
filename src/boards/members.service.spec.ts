import { ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { MembersService } from './members.service';
import { BoardMember } from './entities/board-member.entity';

describe('MembersService', () => {
  let service: MembersService;
  let repo: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findOneBy: jest.fn(),
      create: jest.fn((input: unknown) => input as BoardMember),
      save: jest.fn(async (m: BoardMember) => ({ ...m, id: 'member-1' })),
      find: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service = new MembersService(repo as unknown as Repository<BoardMember>);
  });

  it('requireMembership devuelve la membresía cuando existe', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'm1', role: 'member' });
    const result = await service.requireMembership('b1', 'u1');
    expect(repo.findOneBy).toHaveBeenCalledWith({
      boardId: 'b1',
      userId: 'u1',
    });
    expect(result).toEqual({ id: 'm1', role: 'member' });
  });

  it('requireMembership rechaza con NOT_A_MEMBER cuando no existe', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.requireMembership('b1', 'u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('requireRole rechaza con FORBIDDEN_ROLE si el rol no coincide', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'm1', role: 'member' });
    await expect(
      service.requireRole('b1', 'u1', 'owner'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FORBIDDEN_ROLE' }),
    });
  });

  it('requireRole resuelve si el rol coincide', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'm1', role: 'owner' });
    await expect(
      service.requireRole('b1', 'u1', 'owner'),
    ).resolves.toMatchObject({ role: 'owner' });
  });

  it('addMember es idempotente: no duplica si ya es miembro', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'existing', role: 'member' });
    const result = await service.addMember('b1', 'u1');
    expect(repo.save).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'existing', role: 'member' });
  });

  it('addMember crea la membresía cuando no existe', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await service.addMember('b1', 'u1', 'member');
    expect(repo.create).toHaveBeenCalledWith({
      boardId: 'b1',
      userId: 'u1',
      role: 'member',
    });
    expect(repo.save).toHaveBeenCalled();
  });

  it('list devuelve los miembros con el usuario cargado', async () => {
    repo.find.mockResolvedValue([{ id: 'm1' }]);
    const result = await service.list('b1');
    expect(repo.find).toHaveBeenCalledWith({
      where: { boardId: 'b1' },
      relations: { user: true },
    });
    expect(result).toEqual([{ id: 'm1' }]);
  });

  it('remove elimina la membresía por boardId y userId', async () => {
    await service.remove('b1', 'u1');
    expect(repo.delete).toHaveBeenCalledWith({ boardId: 'b1', userId: 'u1' });
  });
});
