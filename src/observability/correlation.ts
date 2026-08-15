import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  correlationId: string;
  rootId: string;
  socketId?: string;
  userId?: string;
  boardId?: string;
}

const storage = new AsyncLocalStorage<CorrelationContext>();

export function runWithCorrelation<T>(
  context: CorrelationContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function currentCorrelation(): CorrelationContext | undefined {
  return storage.getStore();
}
