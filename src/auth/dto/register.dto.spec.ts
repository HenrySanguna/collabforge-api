import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

async function errorsFor(payload: Partial<RegisterDto>) {
  const dto = plainToInstance(RegisterDto, payload);
  return validate(dto);
}

describe('RegisterDto', () => {
  it('acepta un payload válido', async () => {
    const errors = await errorsFor({
      email: 'ana@test.com',
      password: 'Password123',
      name: 'Ana',
    });
    expect(errors).toHaveLength(0);
  });

  it('rechaza un email con formato inválido', async () => {
    const errors = await errorsFor({
      email: 'no-es-un-email',
      password: 'Password123',
      name: 'Ana',
    });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rechaza una contraseña de menos de 10 caracteres', async () => {
    const errors = await errorsFor({
      email: 'ana@test.com',
      password: 'Ab1',
      name: 'Ana',
    });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rechaza una contraseña sin mayúscula', async () => {
    const errors = await errorsFor({
      email: 'ana@test.com',
      password: 'password123',
      name: 'Ana',
    });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rechaza una contraseña sin dígito', async () => {
    const errors = await errorsFor({
      email: 'ana@test.com',
      password: 'PasswordAbc',
      name: 'Ana',
    });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rechaza un nombre vacío', async () => {
    const errors = await errorsFor({
      email: 'ana@test.com',
      password: 'Password123',
      name: '',
    });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
