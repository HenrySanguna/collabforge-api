import { MigrationInterface, QueryRunner } from 'typeorm';

export class Votes1786340000000 implements MigrationInterface {
  name = 'Votes1786340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "votes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "board_id" uuid NOT NULL,
        "note_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_votes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_votes_board_id" FOREIGN KEY ("board_id")
          REFERENCES "boards" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_votes_note_id" FOREIGN KEY ("note_id")
          REFERENCES "notes" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_votes_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_votes_board_user" ON "votes" ("board_id", "user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_votes_note_id" ON "votes" ("note_id");
    `);
    // No unique index on (note_id, user_id): "allowMultiVote" that governs duplicate votes
    // lives on `boards`, a different table, so a partial index can't condition on it here
    // without duplicating that flag onto `votes`. VotesService.cast takes a pessimistic
    // write lock on the caller's own `board_members` row before checking ALREADY_VOTED,
    // which already serializes that same user's concurrent casts, so the transactional
    // check is race-free without a DB-level constraint as a safety net.

    await queryRunner.query(`
      ALTER TABLE "boards"
        ADD COLUMN "timer_paused" boolean NOT NULL DEFAULT false,
        ADD COLUMN "timer_remaining_ms" integer;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "boards"
        DROP COLUMN "timer_paused",
        DROP COLUMN "timer_remaining_ms";
    `);
    await queryRunner.query(`DROP TABLE "votes";`);
  }
}
