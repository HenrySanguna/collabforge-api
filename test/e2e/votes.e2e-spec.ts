import { WsException } from '@nestjs/websockets';
import { createTestApp, TestContext } from '../utils/create-test-app';
import { registerUser, createBoard } from '../utils/fixtures';
import { VotesService } from '../../src/votes/votes.service';

describe('Votes (e2e)', () => {
  let ctx: TestContext;
  let votesService: VotesService;

  beforeAll(async () => {
    ctx = await createTestApp();
    votesService = ctx.app.get(VotesService);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.dataSource.query(
      `TRUNCATE users, refresh_tokens, boards, board_columns, board_members, notes, votes RESTART IDENTITY CASCADE;`,
    );
  });

  it('concurrencia: 5 votos simultáneos con presupuesto 3 → exactamente 3 filas', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');

    const [column] = await ctx.dataSource.query(
      `SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC LIMIT 1`,
      [board.id],
    );
    const columnId = column.id as string;

    const noteIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const [row] = await ctx.dataSource.query(
        `INSERT INTO notes (board_id, column_id, author_id, text, position)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [board.id, columnId, ana.userId, `Note ${i}`, i],
      );
      noteIds.push(row.id as string);
    }

    await ctx.dataSource.query(
      `UPDATE board_members SET vote_budget = 3 WHERE board_id = $1 AND user_id = $2`,
      [board.id, ana.userId],
    );

    const results = await Promise.allSettled(
      noteIds.map((noteId) => votesService.cast(board.id, noteId, ana.userId)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded).toHaveLength(3);
    expect(failed).toHaveLength(2);

    for (const r of failed) {
      if (r.status !== 'rejected') continue;
      expect(r.reason).toBeInstanceOf(WsException);
      expect((r.reason as WsException).getError()).toMatchObject({
        code: 'BUDGET_EXCEEDED',
      });
    }

    const [{ count }] = await ctx.dataSource.query(
      `SELECT count(*)::int AS count FROM votes WHERE board_id = $1 AND user_id = $2`,
      [board.id, ana.userId],
    );
    expect(count).toBe(3);
  });

  it('respeta ALREADY_VOTED cuando allowMultiVote es false', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');

    const [column] = await ctx.dataSource.query(
      `SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC LIMIT 1`,
      [board.id],
    );
    const [note] = await ctx.dataSource.query(
      `INSERT INTO notes (board_id, column_id, author_id, text, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [board.id, column.id, ana.userId, 'Note', 0],
    );

    await votesService.cast(board.id, note.id, ana.userId);

    try {
      await votesService.cast(board.id, note.id, ana.userId);
      fail('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(WsException);
      expect((err as WsException).getError()).toMatchObject({
        code: 'ALREADY_VOTED',
      });
    }
  });

  it('retract elimina un voto real y libera presupuesto', async () => {
    const ana = await registerUser(ctx.url, 'ana@test.com');
    const board = await createBoard(ctx.url, ana.token, 'Retro Sprint 42');

    const [column] = await ctx.dataSource.query(
      `SELECT id FROM board_columns WHERE board_id = $1 ORDER BY position ASC LIMIT 1`,
      [board.id],
    );
    const [note] = await ctx.dataSource.query(
      `INSERT INTO notes (board_id, column_id, author_id, text, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [board.id, column.id, ana.userId, 'Note', 0],
    );

    await votesService.cast(board.id, note.id, ana.userId);
    const result = await votesService.retract(board.id, note.id, ana.userId);

    expect(result.count).toBe(0);

    const [{ count }] = await ctx.dataSource.query(
      `SELECT count(*)::int AS count FROM votes WHERE note_id = $1 AND user_id = $2`,
      [note.id, ana.userId],
    );
    expect(count).toBe(0);
  });
});
