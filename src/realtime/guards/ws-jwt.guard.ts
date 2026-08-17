import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsAuthService } from '../ws-auth.service';
import type { AuthenticatedSocket } from '../types/authenticated-socket.interface';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly wsAuth: WsAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<AuthenticatedSocket>();

    // ya autenticado en handleConnection: no revalidamos en cada mensaje
    if (client.data.user) return true;

    const token = client.handshake.auth?.token as string | undefined;
    try {
      client.data.user = await this.wsAuth.verify(token);
      return true;
    } catch {
      throw new WsException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid or missing token.',
      });
    }
  }
}
