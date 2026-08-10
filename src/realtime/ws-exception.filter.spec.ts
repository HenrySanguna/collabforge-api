import { ArgumentsHost } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsExceptionFilter } from './ws-exception.filter';

function aHost(client: { emit: jest.Mock }): ArgumentsHost {
  return {
    switchToWs: () => ({ getClient: () => client }),
  } as unknown as ArgumentsHost;
}

describe('WsExceptionFilter', () => {
  it('emite el evento error con el payload de una WsException', () => {
    const client = { emit: jest.fn() };
    const filter = new WsExceptionFilter();

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
    const filter = new WsExceptionFilter();

    filter.catch(new Error('boom'), aHost(client));

    expect(client.emit).toHaveBeenCalledWith('error', {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error.',
    });
  });
});
