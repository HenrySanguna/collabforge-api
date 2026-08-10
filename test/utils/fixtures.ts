import request from 'supertest';

export interface RegisteredUser {
  token: string;
  userId: string;
}

interface AuthSessionResponse {
  accessToken: string;
  user: { id: string };
}

interface CreatedBoardResponse {
  id: string;
  slug: string;
}

export async function registerUser(
  url: string,
  email: string,
): Promise<RegisteredUser> {
  const res = await request(url)
    .post('/api/auth/register')
    .send({ email, password: 'Password123', name: email.split('@')[0] })
    .expect(201);

  const body = res.body as AuthSessionResponse;
  return { token: body.accessToken, userId: body.user.id };
}

export async function createBoard(
  url: string,
  token: string,
  title: string,
): Promise<CreatedBoardResponse> {
  const res = await request(url)
    .post('/api/boards')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, templateKey: 'START_STOP_CONTINUE' })
    .expect(201);

  return res.body as CreatedBoardResponse;
}
