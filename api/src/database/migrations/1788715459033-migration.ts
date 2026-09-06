import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1788715459033 implements MigrationInterface {
    name = 'Migration1788715459033'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "lesson_personalisations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "personId" uuid NOT NULL, "lessonSlug" text NOT NULL, "example" jsonb NOT NULL, "check" jsonb NOT NULL, "model" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_74b7ec589cf8242b646fcf45554" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5ddd260529ae7c73418d63c340" ON "lesson_personalisations"  ("personId", "lessonSlug") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_5ddd260529ae7c73418d63c340"`);
        await queryRunner.query(`DROP TABLE "lesson_personalisations"`);
    }

}
