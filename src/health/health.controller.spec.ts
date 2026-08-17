import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('devuelve status ok cuando la base de datos responde', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const controller = new HealthController(
      dataSource as unknown as DataSource,
    );

    const result = await controller.check();

    expect(result).toMatchObject({ status: 'ok', database: 'up' });
    expect(result.contractsVersion).toEqual(expect.any(String));
  });

  it('lanza ServiceUnavailableException cuando la base de datos falla', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    };
    const controller = new HealthController(
      dataSource as unknown as DataSource,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
