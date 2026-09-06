import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1788721994235 implements MigrationInterface {
    name = 'Migration1788721994235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "context_layers" ADD "strengths" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "context_layers" ADD "struggles" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "context_layers" ADD "preferences" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "context_layers" ADD "lastEvents" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "context_layers" ADD "eventsSinceSynthesis" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "context_layers" ADD "synthesisedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "context_layers" ADD "moduleLines" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "lesson_personalisations" ADD "memoryVersion" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lesson_personalisations" DROP COLUMN "memoryVersion"`);
        await queryRunner.query(`ALTER TABLE "context_layers" DROP COLUMN "moduleLines"`);
        await queryRunner.query(`ALTER TABLE "context_layers" DROP COLUMN "synthesisedAt"`);
        await queryRunner.query(`ALTER TABLE "context_layers" DROP COLUMN "eventsSinceSynthesis"`);
        await queryRunner.query(`ALTER TABLE "context_layers" DROP COLUMN "lastEvents"`);
        await queryRunner.query(`ALTER TABLE "context_layers" DROP COLUMN "preferences"`);
        await queryRunner.query(`ALTER TABLE "context_layers" DROP COLUMN "struggles"`);
        await queryRunner.query(`ALTER TABLE "context_layers" DROP COLUMN "strengths"`);
    }

}
