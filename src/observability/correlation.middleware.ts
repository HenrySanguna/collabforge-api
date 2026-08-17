import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithCorrelation } from './correlation';

const CORRELATION_HEADER = 'x-correlation-id';

export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[CORRELATION_HEADER];
  const correlationId =
    typeof incoming === 'string' && incoming.length > 0
      ? incoming
      : randomUUID();

  res.setHeader(CORRELATION_HEADER, correlationId);
  runWithCorrelation({ correlationId, rootId: correlationId }, next);
}
