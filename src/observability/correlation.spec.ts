import { currentCorrelation, runWithCorrelation } from './correlation';

describe('correlation', () => {
  it('currentCorrelation devuelve undefined fuera de cualquier contexto', () => {
    expect(currentCorrelation()).toBeUndefined();
  });

  it('runWithCorrelation expone el contexto exacto dentro del callback', () => {
    const context = { correlationId: 'corr-1', rootId: 'root-1' };

    const seen = runWithCorrelation(context, () => currentCorrelation());

    expect(seen).toEqual(context);
  });

  it('el contexto se mantiene a través de un await dentro del callback', async () => {
    const context = {
      correlationId: 'corr-2',
      rootId: 'root-2',
      socketId: 'socket-9',
      userId: 'user-9',
      boardId: 'board-9',
    };

    const seen = await runWithCorrelation(context, async () => {
      await Promise.resolve();
      return currentCorrelation();
    });

    expect(seen).toEqual(context);
  });

  it('dos ejecuciones anidadas no se pisan entre sí', () => {
    const outer = { correlationId: 'outer', rootId: 'outer-root' };
    const inner = { correlationId: 'inner', rootId: 'inner-root' };

    const result = runWithCorrelation(outer, () => {
      const innerSeen = runWithCorrelation(inner, () => currentCorrelation());
      return { innerSeen, outerSeenAfter: currentCorrelation() };
    });

    expect(result.innerSeen).toEqual(inner);
    expect(result.outerSeenAfter).toEqual(outer);
  });
});
