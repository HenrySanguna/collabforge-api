import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListBoardsQueryDto } from './list-boards.dto';

describe('ListBoardsQueryDto', () => {
  it('aplica page=1 y limit=20 por defecto', () => {
    const dto = plainToInstance(ListBoardsQueryDto, {});
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('acepta page y limit dentro de rango', async () => {
    const dto = plainToInstance(ListBoardsQueryDto, { page: '3', limit: '50' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
  });

  it('rechaza limit por encima de 50', async () => {
    const dto = plainToInstance(ListBoardsQueryDto, { limit: '51' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('rechaza page menor que 1', async () => {
    const dto = plainToInstance(ListBoardsQueryDto, { page: '0' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });
});
