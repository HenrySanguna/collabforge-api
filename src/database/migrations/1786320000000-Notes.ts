import { MigrationInterface, QueryRunner } from 'typeorm';

export class Notes1786320000000 implements MigrationInterface {
  name = 'Notes1786320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "board_id" uuid NOT NULL,
        "column_id" uuid NOT NULL,
        "author_id" uuid NOT NULL,
        "text" varchar(500) NOT NULL,
        "position" double precision NOT NULL,
        "group_id" uuid,
        "version" integer NOT NULL DEFAULT 1,
        "is_discussed" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notes_board_id" FOREIGN KEY ("board_id")
          REFERENCES "boards" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notes_column_id" FOREIGN KEY ("column_id")
          REFERENCES "board_columns" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_notes_author_id" FOREIGN KEY ("author_id")
          REFERENCES "users" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notes_board_column" ON "notes" ("board_id", "column_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notes";`);
  }
}
