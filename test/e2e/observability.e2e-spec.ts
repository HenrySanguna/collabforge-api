import request from 'supertest';
import { createTestApp, TestContext } from '../utils/create-test-app';

describe('Observability (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('expone GET /metrics sin el prefijo /api en formato Prometheus text/plain', async () => {
    const res = await request(ctx.url).get('/metrics').expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('collabforge_ws_active_connections');
    expect(res.text).toContain('collabforge_ws_events_total');
    expect(res.text).toContain('collabforge_ws_event_duration_seconds');
    expect(res.text).toContain('collabforge_ws_errors_total');
    expect(res.text).toContain('collabforge_board_session_duration_seconds');
  });

  it('rechaza /api/metrics porque metrics queda excluido del prefijo global', async () => {
    await request(ctx.url).get('/api/metrics').expect(404);
  });
});
