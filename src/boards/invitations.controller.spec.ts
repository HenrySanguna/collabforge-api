import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

describe('InvitationsController', () => {
  it('accept delega en InvitationsService.accept con el usuario actual', async () => {
    const invitations = {
      accept: jest.fn().mockResolvedValue({ id: 'board-1' }),
    };
    const controller = new InvitationsController(
      invitations as unknown as InvitationsService,
    );
    const user = { id: 'user-2', email: 'bruno@test.com', name: 'Bruno' };

    await controller.accept(user, { token: 'raw-jwt' });

    expect(invitations.accept).toHaveBeenCalledWith('raw-jwt', 'user-2');
  });
});
