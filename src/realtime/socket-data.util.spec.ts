import { requireSocketData } from './socket-data.util';
import type { AuthenticatedSocket } from './types/authenticated-socket.interface';

function aSocket(data: object): AuthenticatedSocket {
  return { data } as unknown as AuthenticatedSocket;
}

describe('requireSocketData', () => {
  it('devuelve los datos cuando el socket está autenticado', () => {
    const result = requireSocketData(
      aSocket({ user: { id: 'u1' }, boardId: 'b1', role: 'member' }),
    );
    expect(result).toEqual({
      user: { id: 'u1' },
      boardId: 'b1',
      role: 'member',
    });
  });

  it('lanza si el socket no está autenticado todavía', () => {
    expect(() => requireSocketData(aSocket({}))).toThrow();
  });
});
