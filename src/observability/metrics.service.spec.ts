import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('registra las 5 métricas declaradas en el registry', async () => {
    const text = await metrics.registry.metrics();

    expect(text).toContain('collabforge_ws_active_connections');
    expect(text).toContain('collabforge_ws_events_total');
    expect(text).toContain('collabforge_ws_event_duration_seconds');
    expect(text).toContain('collabforge_ws_errors_total');
    expect(text).toContain('collabforge_board_session_duration_seconds');
  });

  it('incConnection/decConnection mueven el gauge de conexiones activas', async () => {
    metrics.incConnection();
    metrics.incConnection();
    const afterTwoInc = await metrics.registry
      .getSingleMetric('collabforge_ws_active_connections')!
      .get();
    expect(afterTwoInc.values[0].value).toBe(2);

    metrics.decConnection();
    const afterOneDec = await metrics.registry
      .getSingleMetric('collabforge_ws_active_connections')!
      .get();
    expect(afterOneDec.values[0].value).toBe(1);
  });

  it('recordWsEvent incrementa el counter y observa la duración con las labels correctas', async () => {
    metrics.recordWsEvent('note:create', 'ok', 0.05);
    metrics.recordWsEvent('note:create', 'error', 0.2);

    const counter = await metrics.registry
      .getSingleMetric('collabforge_ws_events_total')!
      .get();
    expect(counter.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: { event: 'note:create', outcome: 'ok' },
          value: 1,
        }),
        expect.objectContaining({
          labels: { event: 'note:create', outcome: 'error' },
          value: 1,
        }),
      ]),
    );

    const histogram = await metrics.registry
      .getSingleMetric('collabforge_ws_event_duration_seconds')!
      .get();
    const sumEntry = histogram.values.find(
      (v) =>
        (v as { metricName?: string }).metricName?.endsWith('_sum') &&
        v.labels.event === 'note:create',
    );
    expect(sumEntry?.value).toBeCloseTo(0.25, 5);
  });

  it('recordWsError incrementa el counter de errores con la label code', async () => {
    metrics.recordWsError('FORBIDDEN_ROLE');
    metrics.recordWsError('FORBIDDEN_ROLE');
    metrics.recordWsError('NOT_A_MEMBER');

    const counter = await metrics.registry
      .getSingleMetric('collabforge_ws_errors_total')!
      .get();
    expect(counter.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: { code: 'FORBIDDEN_ROLE' },
          value: 2,
        }),
        expect.objectContaining({
          labels: { code: 'NOT_A_MEMBER' },
          value: 1,
        }),
      ]),
    );
  });

  it('recordBoardSessionDuration observa el histograma sin labels', async () => {
    metrics.recordBoardSessionDuration(120);
    metrics.recordBoardSessionDuration(30);

    const histogram = await metrics.registry
      .getSingleMetric('collabforge_board_session_duration_seconds')!
      .get();
    const sumEntry = histogram.values.find((v) =>
      (v as { metricName?: string }).metricName?.endsWith('_sum'),
    );
    expect(sumEntry?.value).toBe(150);
  });
});
