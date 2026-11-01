import { MigrationInterface, QueryRunner } from 'typeorm';

/** Instance settings (uploaded license). */
export class Migration1788920000000 implements MigrationInterface {
  name = 'Migration1788920000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "instance_settings" (
      "key" text NOT NULL,
      "value" text NOT NULL,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_instance_settings" PRIMARY KEY ("key"))`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "instance_settings"`);
  }
}
