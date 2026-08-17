import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

function aConfig(metricsToken: string | undefined): ConfigService {
  return {
    get: jest.fn().mockReturnValue(metricsToken),
  } as unknown as ConfigService;
}

function aRes() {
  return {
    setHeader: jest.fn(),
    send: jest.fn(),
  };
}

describe('MetricsController', () => {
  it('devuelve el texto Prometheus del registry cuando METRICS_TOKEN no está configurado', async () => {
    const metrics = new MetricsService();
    metrics.incConnection();
    const controller = new MetricsController(metrics, aConfig(undefined));
    const res = aRes();

    await controller.getMetrics(undefined, res as never);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      metrics.registry.contentType,
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('collabforge_ws_active_connections'),
    );
  });

  it('rechaza sin token cuando METRICS_TOKEN está configurado', async () => {
    const metrics = new MetricsService();
    const controller = new MetricsController(metrics, aConfig('secret'));
    const res = aRes();

    await expect(
      controller.getMetrics(undefined, res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza con un bearer token incorrecto', async () => {
    const metrics = new MetricsService();
    const controller = new MetricsController(metrics, aConfig('secret'));
    const res = aRes();

    await expect(
      controller.getMetrics('Bearer wrong-token', res as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('acepta el bearer token correcto', async () => {
    const metrics = new MetricsService();
    const controller = new MetricsController(metrics, aConfig('secret'));
    const res = aRes();

    await controller.getMetrics('Bearer secret', res as never);

    expect(res.send).toHaveBeenCalled();
  });
});
