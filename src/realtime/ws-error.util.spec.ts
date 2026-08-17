import { WsException } from '@nestjs/websockets';
import { toWsErrorPayload } from './ws-error.util';

describe('toWsErrorPayload', () => {
  it('mapea una WsException de string a INTERNAL_ERROR con ese mensaje', () => {
    expect(toWsErrorPayload(new WsException('boom'))).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'boom',
    });
  });

  it('mapea una WsException con payload estructurado', () => {
    expect(
      toWsErrorPayload(
        new WsException({
          code: 'PHASE_NOT_ALLOWED',
          message: 'nope',
          meta: { currentPhase: 'VOTING' },
        }),
      ),
    ).toEqual({
      code: 'PHASE_NOT_ALLOWED',
      message: 'nope',
      meta: { currentPhase: 'VOTING' },
    });
  });

  it('cae a INTERNAL_ERROR genérico para cualquier otro error', () => {
    expect(toWsErrorPayload(new Error('unexpected'))).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error.',
    });
  });
});
