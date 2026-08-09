import request from 'supertest';
import { RefreshToken } from '../../src/auth/entities/refresh-token.entity';
import { createTestApp, TestContext } from '../utils/create-test-app';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.dataSource.query(
      `TRUNCATE users, refresh_tokens RESTART IDENTITY CASCADE;`,
    );
  });

  function registerAna() {
    return request(ctx.url)
      .post('/api/auth/register')
      .send({ email: 'ana@test.com', password: 'Password123', name: 'Ana' });
  }

  it('registra, autentica y refresca rotando el token', async () => {
    const register = await registerAna().expect(201);

    expect(register.body.accessToken).toBeDefined();
    expect(register.body.user.passwordHash).toBeUndefined();

    const cookie = register.get('set-cookie')![0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/auth\/refresh/);

    const refresh = await request(ctx.url)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);

    const newCookie = refresh.get('set-cookie')![0];
    expect(newCookie).not.toBe(cookie);
    expect(refresh.body.accessToken).toBeDefined();
  });

  it('revoca la sesión completa al reutilizar un refresh token ya consumido', async () => {
    const register = await registerAna().expect(201);
    const cookie = register.get('set-cookie')![0];

    await request(ctx.url)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(200);
    // reutilización del token ya consumido
    await request(ctx.url)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);

    const family = await ctx.dataSource.getRepository(RefreshToken).find();
    expect(family.length).toBeGreaterThan(0);
    expect(family.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('rechaza contraseñas débiles', async () => {
    await request(ctx.url)
      .post('/api/auth/register')
      .send({ email: 'x@test.com', password: '123', name: 'X' })
      .expect(400);
  });

  it('rechaza un email con formato inválido', async () => {
    await request(ctx.url)
      .post('/api/auth/register')
      .send({ email: 'no-es-un-email', password: 'Password123', name: 'X' })
      .expect(400);
  });

  it('GET /me sin token responde 401', async () => {
    await request(ctx.url).get('/api/auth/me').expect(401);
  });

  it('GET /me con access token devuelve el usuario', async () => {
    const register = await registerAna().expect(201);

    const me = await request(ctx.url)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${register.body.accessToken as string}`)
      .expect(200);

    expect(me.body).toEqual({
      id: expect.any(String),
      email: 'ana@test.com',
      name: 'Ana',
    });
  });

  it('logout revoca el refresh token y limpia la cookie', async () => {
    const register = await registerAna().expect(201);
    const cookie = register.get('set-cookie')![0];

    const logout = await request(ctx.url)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Authorization', `Bearer ${register.body.accessToken as string}`)
      .expect(204);

    expect(logout.get('set-cookie')![0]).toMatch(/cf_rt=;/);

    await request(ctx.url)
      .post('/api/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('login rechaza credenciales inválidas', async () => {
    await registerAna().expect(201);

    await request(ctx.url)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: 'wrong-password' })
      .expect(401);
  });

  it('login autentica con credenciales válidas', async () => {
    await registerAna().expect(201);

    const login = await request(ctx.url)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: 'Password123' })
      .expect(200);

    expect(login.body.accessToken).toBeDefined();
  });
});
