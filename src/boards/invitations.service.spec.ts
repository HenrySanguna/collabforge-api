import { BadRequestException, GoneException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { InvitationsService } from './invitations.service';
import { BoardsService } from './boards.service';
import { MembersService } from './members.service';
import { Board } from './entities/board.entity';

function aBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'board-1',
    slug: 'retro-42-abcdef',
    title: 'Retro 42',
    ownerId: 'owner-1',
    isArchived: false,
    inviteTokenId: null,
    inviteExpiresAt: null,
    ...overrides,
  } as Board;
}

describe('InvitationsService', () => {
  let service: InvitationsService;
  let boardsRepo: { save: jest.Mock };
  let boardsService: {
    requireOwner: jest.Mock;
    findByIdOrFail: jest.Mock;
    findBySlugForUser: jest.Mock;
  };
  let membersService: { addMember: jest.Mock };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let config: { getOrThrow: jest.Mock };

  beforeEach(() => {
    boardsRepo = { save: jest.fn(async (b: Board) => b) };
    boardsService = {
      requireOwner: jest.fn(),
      findByIdOrFail: jest.fn(),
      findBySlugForUser: jest.fn(),
    };
    membersService = { addMember: jest.fn() };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };
    config = {
      getOrThrow: jest.fn().mockReturnValue('invite-secret-at-least-32-chars'),
    };

    service = new InvitationsService(
      boardsRepo as unknown as Repository<Board>,
      boardsService as unknown as BoardsService,
      membersService as unknown as MembersService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
    );
  });

  describe('generate', () => {
    it('rota el inviteTokenId y firma un token con expiración', async () => {
      boardsService.requireOwner.mockResolvedValue(aBoard());

      const result = await service.generate('board-1', 'owner-1', 24);

      expect(boardsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ inviteTokenId: expect.any(String) }),
      );
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: 'board-1' }),
        expect.objectContaining({ expiresIn: 24 * 60 * 60 }),
      );
      expect(result.token).toBe('signed-token');
      expect(result.expiresAt).toEqual(expect.any(String));
    });
  });

  describe('revoke', () => {
    it('limpia el inviteTokenId, invalidando enlaces previos', async () => {
      boardsService.requireOwner.mockResolvedValue(
        aBoard({ inviteTokenId: 'old-token-id' }),
      );

      await service.revoke('board-1', 'owner-1');

      expect(boardsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ inviteTokenId: null, inviteExpiresAt: null }),
      );
    });
  });

  describe('accept', () => {
    it('une al usuario cuando el token es válido y coincide con el actual', async () => {
      jwt.verifyAsync.mockResolvedValue({
        boardId: 'board-1',
        tokenId: 'current-token-id',
      });
      boardsService.findByIdOrFail.mockResolvedValue(
        aBoard({ inviteTokenId: 'current-token-id' }),
      );
      boardsService.findBySlugForUser.mockResolvedValue({ id: 'board-1' });

      await service.accept('raw-jwt', 'user-2');

      expect(membersService.addMember).toHaveBeenCalledWith(
        'board-1',
        'user-2',
        'member',
      );
    });

    it('rechaza un token con firma inválida o expirado', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(service.accept('raw-jwt', 'user-2')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(membersService.addMember).not.toHaveBeenCalled();
    });

    it('rechaza un token cuya rotación ya invalidó (tokenId no coincide)', async () => {
      jwt.verifyAsync.mockResolvedValue({
        boardId: 'board-1',
        tokenId: 'old-token-id',
      });
      boardsService.findByIdOrFail.mockResolvedValue(
        aBoard({ inviteTokenId: 'new-token-id-after-rotation' }),
      );

      await expect(service.accept('raw-jwt', 'user-2')).rejects.toBeInstanceOf(
        GoneException,
      );
      expect(membersService.addMember).not.toHaveBeenCalled();
    });

    it('rechaza unirse a un tablero archivado', async () => {
      jwt.verifyAsync.mockResolvedValue({
        boardId: 'board-1',
        tokenId: 'current-token-id',
      });
      boardsService.findByIdOrFail.mockResolvedValue(
        aBoard({ inviteTokenId: 'current-token-id', isArchived: true }),
      );

      await expect(service.accept('raw-jwt', 'user-2')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(membersService.addMember).not.toHaveBeenCalled();
    });
  });
});
