import type { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    findOneBy: jest.Mock;
    createQueryBuilder: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let queryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(() => {
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    repo = {
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      count: jest.fn(),
      create: jest.fn((input: unknown) => input as User),
      save: jest.fn(async (user: User) => user),
    };
    service = new UsersService(repo as unknown as Repository<User>);
  });

  it('findActiveById busca por id con isActive true', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'u1' });
    const result = await service.findActiveById('u1');
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'u1', isActive: true });
    expect(result).toEqual({ id: 'u1' });
  });

  it('findByEmail incluye explícitamente el passwordHash excluido por defecto', async () => {
    queryBuilder.getOne.mockResolvedValue({ id: 'u1', email: 'ana@test.com' });

    const result = await service.findByEmail('ana@test.com');

    expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.passwordHash');
    expect(queryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
      email: 'ana@test.com',
    });
    expect(result).toEqual({ id: 'u1', email: 'ana@test.com' });
  });

  it('existsByEmail es true cuando hay al menos un registro', async () => {
    repo.count.mockResolvedValue(1);
    expect(await service.existsByEmail('ana@test.com')).toBe(true);
  });

  it('existsByEmail es false cuando no hay registros', async () => {
    repo.count.mockResolvedValue(0);
    expect(await service.existsByEmail('nadie@test.com')).toBe(false);
  });

  it('create construye y guarda el usuario', async () => {
    const input = {
      email: 'ana@test.com',
      passwordHash: 'hash',
      name: 'Ana',
      avatarColor: '#fff',
    };

    const result = await service.create(input);

    expect(repo.create).toHaveBeenCalledWith(input);
    expect(repo.save).toHaveBeenCalled();
    expect(result).toEqual(input);
  });
});
