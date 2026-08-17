import { MigrationInterface, QueryRunner } from 'typeorm';

export class BoardsAndMembers1786306068086 implements MigrationInterface {
  name = 'BoardsAndMembers1786306068086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "boards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" varchar(40) NOT NULL,
        "title" varchar(120) NOT NULL,
        "owner_id" uuid NOT NULL,
        "phase" varchar(16) NOT NULL DEFAULT 'COLLECTING',
        "revealed" boolean NOT NULL DEFAULT false,
        "vote_budget" smallint NOT NULL DEFAULT 3,
        "allow_multi_vote" boolean NOT NULL DEFAULT false,
        "live_tally" boolean NOT NULL DEFAULT false,
        "timer_ends_at" timestamptz,
        "is_archived" boolean NOT NULL DEFAULT false,
        "invite_token_id" uuid,
        "invite_expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_boards_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_boards_owner_id" FOREIGN KEY ("owner_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_boards_slug" ON "boards" ("slug");`,
    );

    await queryRunner.query(`
      CREATE TABLE "board_columns" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "board_id" uuid NOT NULL,
        "title" varchar(60) NOT NULL,
        "color" varchar(7) NOT NULL,
        "position" smallint NOT NULL,
        CONSTRAINT "PK_board_columns_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_board_columns_board_id" FOREIGN KEY ("board_id")
          REFERENCES "boards" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_board_columns_board_position" ON "board_columns" ("board_id", "position");
    `);

    await queryRunner.query(`
      CREATE TABLE "board_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "board_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" varchar(10) NOT NULL DEFAULT 'member',
        "vote_budget" smallint NOT NULL DEFAULT 3,
        "joined_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_board_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_board_members_board_id" FOREIGN KEY ("board_id")
          REFERENCES "boards" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_board_members_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "uq_board_member" UNIQUE ("board_id", "user_id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_board_members_user_id" ON "board_members" ("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "board_members";`);
    await queryRunner.query(`DROP TABLE "board_columns";`);
    await queryRunner.query(`DROP TABLE "boards";`);
  }
}
