import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import type { AuthenticatedSocket } from './types/authenticated-socket.interface';
import { toWsErrorPayload } from './ws-error.util';

@Catch()
export class WsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<AuthenticatedSocket>();
    const payload = toWsErrorPayload(exception);

    if (!(exception instanceof WsException)) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    client.emit('error', payload);
  }
}
