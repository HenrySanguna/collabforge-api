import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { InvitationsService } from './invitations.service';

describe('BoardsController', () => {
  let controller: BoardsController;
  let boards: jest.Mocked<
    Pick<
      BoardsService,
      'create' | 'listForUser' | 'findBySlugForUser' | 'archive'
    >
  >;
  let invitations: jest.Mocked<Pick<InvitationsService, 'generate' | 'revoke'>>;

  const user = { id: 'user-1', email: 'ana@test.com', name: 'Ana' };

  beforeEach(() => {
    boards = {
      create: jest.fn().mockResolvedValue({ id: 'board-1' }),
      listForUser: jest
        .fn()
        .mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }),
      findBySlugForUser: jest.fn().mockResolvedValue({ id: 'board-1' }),
      archive: jest.fn().mockResolvedValue({ id: 'board-1', isArchived: true }),
    };
    invitations = {
      generate: jest.fn().mockResolvedValue({ token: 't', expiresAt: 'x' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    controller = new BoardsController(
      boards as unknown as BoardsService,
      invitations as unknown as InvitationsService,
    );
  });

  it('create delega en BoardsService.create con el usuario actual', async () => {
    const dto = { title: 'Retro', templateKey: 'BLANK' as const };
    await controller.create(user, dto);
    expect(boards.create).toHaveBeenCalledWith('user-1', dto);
  });

  it('list delega en BoardsService.listForUser con la paginación', async () => {
    await controller.list(user, { page: 2, limit: 10 });
    expect(boards.listForUser).toHaveBeenCalledWith('user-1', 2, 10);
  });

  it('detail delega en BoardsService.findBySlugForUser', async () => {
    await controller.detail(user, 'retro-42-abcdef');
    expect(boards.findBySlugForUser).toHaveBeenCalledWith(
      'retro-42-abcdef',
      'user-1',
    );
  });

  it('archive delega en BoardsService.archive', async () => {
    await controller.archive(user, 'board-1');
    expect(boards.archive).toHaveBeenCalledWith('board-1', 'user-1');
  });

  it('createInvite delega en InvitationsService.generate', async () => {
    await controller.createInvite(user, 'board-1');
    expect(invitations.generate).toHaveBeenCalledWith('board-1', 'user-1');
  });

  it('revokeInvite delega en InvitationsService.revoke', async () => {
    await controller.revokeInvite(user, 'board-1');
    expect(invitations.revoke).toHaveBeenCalledWith('board-1', 'user-1');
  });
});
