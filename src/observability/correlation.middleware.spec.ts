import type { NextFunction, Request, Response } from 'express';
import { correlationMiddleware } from './correlation.middleware';
import { currentCorrelation } from './correlation';

function aReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function aRes(): Response & { setHeader: jest.Mock } {
  return { setHeader: jest.fn() } as unknown as Response & {
    setHeader: jest.Mock;
  };
}

describe('correlationMiddleware', () => {
  it('genera un correlationId nuevo cuando no llega el header', () => {
    const req = aReq();
    const res = aRes();
    let seenInsideNext: ReturnType<typeof currentCorrelation>;
    const next: NextFunction = () => {
      seenInsideNext = currentCorrelation();
    };

    correlationMiddleware(req, res, next);

    expect(seenInsideNext).toBeDefined();
    expect(typeof seenInsideNext?.correlationId).toBe('string');
    expect(seenInsideNext?.correlationId.length).toBeGreaterThan(0);
    expect(seenInsideNext?.rootId).toBe(seenInsideNext?.correlationId);
    expect(res.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      seenInsideNext?.correlationId,
    );
  });

  it('reutiliza el header x-correlation-id entrante como correlationId y rootId', () => {
    const req = aReq({ 'x-correlation-id': 'incoming-corr-id' });
    const res = aRes();
    let seenInsideNext: ReturnType<typeof currentCorrelation>;
    const next: NextFunction = () => {
      seenInsideNext = currentCorrelation();
    };

    correlationMiddleware(req, res, next);

    expect(seenInsideNext).toEqual({
      correlationId: 'incoming-corr-id',
      rootId: 'incoming-corr-id',
    });
    expect(res.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      'incoming-corr-id',
    );
  });

  it('llama a next exactamente una vez', () => {
    const req = aReq();
    const res = aRes();
    const next = jest.fn();

    correlationMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
