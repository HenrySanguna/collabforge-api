import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from './ws-jwt.guard';
import type { WsAuthService } from '../ws-auth.service';

function aContext(socketData: object, token?: string): ExecutionContext {
  const client = {
    data: socketData,
    handshake: { auth: token ? { token } : {} },
  };
  return {
    switchToWs: () => ({ getClient: () => client }),
  } as unknown as ExecutionContext;
}

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let wsAuth: { verify: jest.Mock };

  beforeEach(() => {
    wsAuth = { verify: jest.fn() };
    guard = new WsJwtGuard(wsAuth as unknown as WsAuthService);
  });

  it('permite el paso si el socket ya está autenticado', async () => {
    const ctx = aContext({ user: { id: 'u1' } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(wsAuth.verify).not.toHaveBeenCalled();
  });

  it('verifica el token del handshake y lo guarda en socket.data', async () => {
    const data: { user?: unknown } = {};
    const ctx = aContext(data, 'valid-token');
    wsAuth.verify.mockResolvedValue({ id: 'u1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(data.user).toEqual({ id: 'u1' });
  });

  it('rechaza con WsException cuando la verificación falla', async () => {
    const ctx = aContext({}, 'bad-token');
    wsAuth.verify.mockRejectedValue(new Error('invalid'));

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(WsException);
  });
});
