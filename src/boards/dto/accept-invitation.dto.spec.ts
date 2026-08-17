import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcceptInvitationDto } from './accept-invitation.dto';

describe('AcceptInvitationDto', () => {
  it('acepta un token no vacío', async () => {
    const dto = plainToInstance(AcceptInvitationDto, { token: 'raw-jwt' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un token vacío', async () => {
    const dto = plainToInstance(AcceptInvitationDto, { token: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });
});
