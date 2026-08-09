import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1786294486289 implements MigrationInterface {
  name = 'InitialSchema1786294486289';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext;`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS pgcrypto;`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS citext;`);
  }
}
