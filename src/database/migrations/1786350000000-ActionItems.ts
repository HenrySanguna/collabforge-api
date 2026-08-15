import { MigrationInterface, QueryRunner } from 'typeorm';

export class ActionItems1786350000000 implements MigrationInterface {
  name = 'ActionItems1786350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "action_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "board_id" uuid NOT NULL,
        "text" text NOT NULL,
        "assignee_id" uuid,
        "status" varchar(8) NOT NULL DEFAULT 'open',
        "created_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_action_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_action_items_board_id" FOREIGN KEY ("board_id")
          REFERENCES "boards" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_action_items_board_id" ON "action_items" ("board_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "action_items";`);
  }
}
