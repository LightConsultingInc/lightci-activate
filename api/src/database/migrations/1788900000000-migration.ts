import { MigrationInterface, QueryRunner } from 'typeorm';

/** Orgs own their email domains so sign-in can route a person to their company's SSO. */
export class Migration1788900000000 implements MigrationInterface {
  name = 'Migration1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orgs" ADD "emailDomains" text array NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgs" DROP COLUMN "emailDomains"`);
  }
}
