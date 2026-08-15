import {
  Controller,
  Get,
  Headers,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

const BEARER_PREFIX = 'Bearer ';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async getMetrics(
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const requiredToken = this.config.get<string>('METRICS_TOKEN');
    if (requiredToken) {
      const providedToken = authorization?.startsWith(BEARER_PREFIX)
        ? authorization.slice(BEARER_PREFIX.length)
        : undefined;
      if (providedToken !== requiredToken) {
        throw new UnauthorizedException();
      }
    }

    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}
