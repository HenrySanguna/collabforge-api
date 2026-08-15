import { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom, of, throwError } from 'rxjs';
import { WsObservabilityInterceptor } from './ws-observability.interceptor';
import { currentCorrelation } from './correlation';
import type { MetricsService } from './metrics.service';

function aContext(
  clientData: Record<string, unknown>,
  pattern: string,
): ExecutionContext {
  const client = { id: 'socket-1', data: clientData };
  return {
    switchToWs: () => ({
      getClient: () => client,
      getPattern: () => pattern,
    }),
  } as unknown as ExecutionContext;
}

function aHandler(handle: CallHandler['handle']): CallHandler {
  return { handle };
}

describe('WsObservabilityInterceptor', () => {
  let metrics: { recordWsEvent: jest.Mock };
  let interceptor: WsObservabilityInterceptor;

  beforeEach(() => {
    metrics = { recordWsEvent: jest.fn() };
    interceptor = new WsObservabilityInterceptor(
      metrics as unknown as MetricsService,
    );
  });

  it('el contexto ALS está disponible dentro de un handler async, incluso tras un await', async () => {
    let seenInsideHandler: ReturnType<typeof currentCorrelation>;
    const handler = aHandler(() =>
      defer(async () => {
        await Promise.resolve();
        seenInsideHandler = currentCorrelation();
        return { ok: true };
      }),
    );

    const result = await firstValueFrom(
      interceptor.intercept(
        aContext({ user: { id: 'user-1' }, boardId: 'board-1' }, 'note:create'),
        handler,
      ),
    );

    expect(result).toEqual({ ok: true });
    expect(seenInsideHandler).toBeDefined();
    expect(seenInsideHandler?.socketId).toBe('socket-1');
    expect(seenInsideHandler?.userId).toBe('user-1');
    expect(seenInsideHandler?.boardId).toBe('board-1');
  });

  it('fuera del interceptor no hay contexto ALS filtrado (aislamiento por invocación)', async () => {
    const handler = aHandler(() => of({ ok: true }));

    await firstValueFrom(
      interceptor.intercept(
        aContext({ user: { id: 'user-1' }, boardId: 'board-1' }, 'note:create'),
        handler,
      ),
    );

    expect(currentCorrelation()).toBeUndefined();
  });

  it('registra outcome ok con el nombre de evento tomado de getPattern()', async () => {
    const handler = aHandler(() => of({ ok: true }));

    await firstValueFrom(
      interceptor.intercept(
        aContext({ user: { id: 'user-1' }, boardId: 'board-1' }, 'vote:cast'),
        handler,
      ),
    );

    expect(metrics.recordWsEvent).toHaveBeenCalledTimes(1);
    const [event, outcome, duration] = metrics.recordWsEvent.mock.calls[0];
    expect(event).toBe('vote:cast');
    expect(outcome).toBe('ok');
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('registra outcome error y propaga el error cuando el handler falla', async () => {
    const boom = new Error('boom');
    const handler = aHandler(() => throwError(() => boom));

    await expect(
      firstValueFrom(
        interceptor.intercept(
          aContext(
            { user: { id: 'user-1' }, boardId: 'board-1' },
            'note:delete',
          ),
          handler,
        ),
      ),
    ).rejects.toBe(boom);

    expect(metrics.recordWsEvent).toHaveBeenCalledWith(
      'note:delete',
      'error',
      expect.any(Number),
    );
  });

  it('usa client.data.rootId como rootId cuando ya existe en el socket', async () => {
    let seenInsideHandler: ReturnType<typeof currentCorrelation>;
    const handler = aHandler(() =>
      defer(() => {
        seenInsideHandler = currentCorrelation();
        return of({ ok: true });
      }),
    );

    await firstValueFrom(
      interceptor.intercept(
        aContext(
          {
            user: { id: 'user-1' },
            boardId: 'board-1',
            rootId: 'existing-root',
          },
          'note:create',
        ),
        handler,
      ),
    );

    expect(seenInsideHandler?.rootId).toBe('existing-root');
  });
});
