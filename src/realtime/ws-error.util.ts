import { WsException } from '@nestjs/websockets';
import type { WsErrorPayload } from '../contracts';

export function toWsErrorPayload(error: unknown): WsErrorPayload {
  if (error instanceof WsException) {
    const raw = error.getError();
    if (typeof raw === 'string') {
      return { code: 'INTERNAL_ERROR', message: raw };
    }
    const payload = raw as Partial<WsErrorPayload>;
    return {
      code: payload.code ?? 'INTERNAL_ERROR',
      message: payload.message ?? 'Unexpected error.',
      meta: payload.meta,
    };
  }
  return { code: 'INTERNAL_ERROR', message: 'Unexpected error.' };
}
