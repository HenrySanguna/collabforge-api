import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CONTRACTS_VERSION } from '../contracts';

const startedAt = Date.now();

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    const database = await this.checkDatabase();

    const payload = {
      status: database === 'up' ? 'ok' : 'error',
      database,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      contractsVersion: CONTRACTS_VERSION,
      commit: process.env.GIT_SHA ?? 'unknown',
    };

    if (payload.status === 'error') {
      throw new ServiceUnavailableException(payload);
    }
    return payload;
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
