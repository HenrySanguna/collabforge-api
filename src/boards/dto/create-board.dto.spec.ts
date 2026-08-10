import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBoardDto } from './create-board.dto';

describe('CreateBoardDto', () => {
  it('acepta un payload válido', async () => {
    const dto = plainToInstance(CreateBoardDto, {
      title: 'Retro 42',
      templateKey: 'BLANK',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un título vacío', async () => {
    const dto = plainToInstance(CreateBoardDto, {
      title: '',
      templateKey: 'BLANK',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rechaza una plantilla que no existe', async () => {
    const dto = plainToInstance(CreateBoardDto, {
      title: 'Retro',
      templateKey: 'NO_EXISTE',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'templateKey')).toBe(true);
  });
});
