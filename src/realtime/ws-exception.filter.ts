import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { AuthenticatedSocket } from './types/authenticated-socket.interface';
import { toWsErrorPayload } from './ws-error.util';
import { currentCorrelation } from '../observability/correlation';
import { MetricsService } from '../observability/metrics.service';

@Catch()
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  constructor(private readonly metrics: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<AuthenticatedSocket>();
    const payload = toWsErrorPayload(exception);
    const correlationId = currentCorrelation()?.correlationId;

    this.metrics.recordWsError(payload.code);

    if (!(exception instanceof WsException)) {
      this.logger.error(
        `[correlationId=${correlationId ?? 'none'}] ${
          exception instanceof Error ? exception.stack : String(exception)
        }`,
      );
    }

    client.emit('error', payload);
  }
}
