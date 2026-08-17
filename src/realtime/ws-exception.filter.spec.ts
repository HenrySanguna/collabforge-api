import { ArgumentsHost, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsExceptionFilter } from './ws-exception.filter';
import { runWithCorrelation } from '../observability/correlation';
import type { MetricsService } from '../observability/metrics.service';

function aHost(client: { emit: jest.Mock }): ArgumentsHost {
  return {
    switchToWs: () => ({ getClient: () => client }),
  } as unknown as ArgumentsHost;
}

describe('WsExceptionFilter', () => {
  let metrics: { recordWsError: jest.Mock };
  let filter: WsExceptionFilter;

  beforeEach(() => {
    metrics = { recordWsError: jest.fn() };
    filter = new WsExceptionFilter(metrics as unknown as MetricsService);
  });

  it('emite el evento error con el payload de una WsException', () => {
    const client = { emit: jest.fn() };

    filter.catch(
      new WsException({ code: 'NOT_A_MEMBER', message: 'nope' }),
      aHost(client),
    );

    expect(client.emit).toHaveBeenCalledWith('error', {
      code: 'NOT_A_MEMBER',
      message: 'nope',
      meta: undefined,
    });
  });

  it('emite INTERNAL_ERROR genérico para errores no controlados', () => {
    const client = { emit: jest.fn() };

    filter.catch(new Error('boom'), aHost(client));

    expect(client.emit).toHaveBeenCalledWith('error', {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error.',
    });
  });

  it('incrementa ws_errors_total con el code del payload para una WsException', () => {
    const client = { emit: jest.fn() };

    filter.catch(
      new WsException({ code: 'FORBIDDEN_ROLE', message: 'no' }),
      aHost(client),
    );

    expect(metrics.recordWsError).toHaveBeenCalledWith('FORBIDDEN_ROLE');
  });

  it('incrementa ws_errors_total con INTERNAL_ERROR para errores no controlados', () => {
    const client = { emit: jest.fn() };

    filter.catch(new Error('boom'), aHost(client));

    expect(metrics.recordWsError).toHaveBeenCalledWith('INTERNAL_ERROR');
  });

  it('registra el log incluyendo el correlationId activo en el ALS', () => {
    const client = { emit: jest.fn() };
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    runWithCorrelation(
      { correlationId: 'corr-abc-123', rootId: 'root-1' },
      () => {
        filter.catch(new Error('boom'), aHost(client));
      },
    );

    expect(errorSpy).toHaveBeenCalled();
    const loggedMessage = errorSpy.mock.calls[0][0] as string;
    expect(loggedMessage).toContain('corr-abc-123');

    errorSpy.mockRestore();
  });

  it('no rompe si no hay contexto de correlación activo', () => {
    const client = { emit: jest.fn() };
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    expect(() => filter.catch(new Error('boom'), aHost(client))).not.toThrow();

    errorSpy.mockRestore();
  });
});
