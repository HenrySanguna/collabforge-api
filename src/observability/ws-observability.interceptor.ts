import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';
import { runWithCorrelation } from './correlation';
import { MetricsService, type ObservableClientEvent } from './metrics.service';
import type { AuthenticatedSocket } from '../realtime/types/authenticated-socket.interface';

@Injectable()
export class WsObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const wsHost = context.switchToWs();
    const client = wsHost.getClient<AuthenticatedSocket>();
    const event = wsHost.getPattern() as ObservableClientEvent;
    const startedAt = process.hrtime.bigint();

    const correlationContext = {
      correlationId: randomUUID(),
      rootId: client.data.rootId ?? client.data.user?.id ?? client.id,
      socketId: client.id,
      userId: client.data.user?.id,
      boardId: client.data.boardId,
    };

    // next.handle() is lazy: wrapping only the *call* would leave the
    // handler running outside the ALS context. The subscription itself
    // must happen inside runWithCorrelation.
    return new Observable((subscriber) =>
      runWithCorrelation(correlationContext, () =>
        next
          .handle()
          .pipe(
            tap({
              next: () => this.recordOutcome(event, startedAt, 'ok'),
              error: () => this.recordOutcome(event, startedAt, 'error'),
            }),
          )
          .subscribe(subscriber),
      ),
    );
  }

  private recordOutcome(
    event: ObservableClientEvent,
    startedAt: bigint,
    outcome: 'ok' | 'error',
  ): void {
    const durationSeconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    this.metrics.recordWsEvent(event, outcome, durationSeconds);
  }
}
