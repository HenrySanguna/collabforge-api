import request from 'supertest';
import { createTestApp, TestContext } from '../utils/create-test-app';
import { registerUser, createBoard } from '../utils/fixtures';

describe('Boards (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.dataSource.query(
      `TRUNCATE users, refresh_tokens, boards, board_columns, board_members RESTART IDENTITY CASCADE;`,
    );
  });

  it('crea un tablero con las columnas de la plantilla y al creador como owner', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');

    const res = await request(ctx.url)
      .post('/api/boards')
      .set('Authorization', `Bearer ${ana.token}`)
      .send({ title: 'Retro Sprint 42', templateKey: 'START_STOP_CONTINUE' })
      .expect(201);

    expect(res.body.myRole).toBe('owner');
    expect(res.body.phase).toBe('COLLECTING');
    expect(res.body.columns).toHaveLength(3);
    expect(res.body.columns.map((c: { title: string }) => c.title)).toEqual([
      'Start',
      'Stop',
      'Continue',
    ]);
  });

  it('lista solo los tableros a los que el usuario pertenece', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    await createBoard(ctx.url, ana.token, 'Retro de Ana');

    const res = await request(ctx.url)
      .get('/api/boards')
      .set('Authorization', `Bearer ${bruno.token}`)
      .expect(200);

    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('rechaza acceder al detalle de un tablero ajeno', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro de Ana');

    await request(ctx.url)
      .get(`/api/boards/${board.slug}`)
      .set('Authorization', `Bearer ${bruno.token}`)
      .expect(403);
  });

  it('rechaza que alguien que no es owner archive el tablero', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro de Ana');

    await request(ctx.url)
      .patch(`/api/boards/${board.id}/archive`)
      .set('Authorization', `Bearer ${bruno.token}`)
      .expect(403);
  });

  it('flujo completo de invitación: generar, aceptar, y ver el tablero en ambas listas', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');

    const invite = await request(ctx.url)
      .post(`/api/boards/${board.id}/invite`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(201);

    expect(invite.body.token).toBeDefined();

    await request(ctx.url)
      .post('/api/invitations/accept')
      .set('Authorization', `Bearer ${bruno.token}`)
      .send({ token: invite.body.token })
      .expect(200);

    const brunoDetail = await request(ctx.url)
      .get(`/api/boards/${board.slug}`)
      .set('Authorization', `Bearer ${bruno.token}`)
      .expect(200);
    expect(brunoDetail.body.myRole).toBe('member');

    const brunoList = await request(ctx.url)
      .get('/api/boards')
      .set('Authorization', `Bearer ${bruno.token}`)
      .expect(200);
    expect(brunoList.body.total).toBe(1);
  });

  it('rechaza un enlace de invitación tras revocarlo', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');

    const invite = await request(ctx.url)
      .post(`/api/boards/${board.id}/invite`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(201);

    await request(ctx.url)
      .delete(`/api/boards/${board.id}/invite`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(204);

    await request(ctx.url)
      .post('/api/invitations/accept')
      .set('Authorization', `Bearer ${bruno.token}`)
      .send({ token: invite.body.token })
      .expect(410);
  });

  it('un enlace de invitación rotado invalida el anterior', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const bruno = await registerUser(ctx.url, 'bruno@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');

    const firstInvite = await request(ctx.url)
      .post(`/api/boards/${board.id}/invite`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(201);

    // rotar el enlace
    await request(ctx.url)
      .post(`/api/boards/${board.id}/invite`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(201);

    await request(ctx.url)
      .post('/api/invitations/accept')
      .set('Authorization', `Bearer ${bruno.token}`)
      .send({ token: firstInvite.body.token })
      .expect(410);
  });

  it('archiva el tablero cuando lo solicita el owner', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');

    const res = await request(ctx.url)
      .patch(`/api/boards/${board.id}/archive`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(200);

    expect(res.body.isArchived).toBe(true);
  });
});
