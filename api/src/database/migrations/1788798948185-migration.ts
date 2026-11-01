import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1788798948185 implements MigrationInterface {
  name = 'Migration1788798948185';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lesson_personalisations" ADD "moduleCode" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "lesson_personalisations" DROP COLUMN "moduleCode"`,
    );
  }
}
