import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('acepta un payload válido', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'ana@test.com',
      password: 'x',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un email inválido', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'no-es-email',
      password: 'x',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rechaza una contraseña vacía', async () => {
    const dto = plainToInstance(LoginDto, {
      email: 'ana@test.com',
      password: '',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});
