import { MigrationInterface, QueryRunner } from 'typeorm';

/** Built-in OAuth server for OIDC mode, plus a generic identity link on people. */
export class Migration1788910000000 implements MigrationInterface {
  name = 'Migration1788910000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "people" ADD "identityIssuer" text`);
    await q.query(`ALTER TABLE "people" ADD "identitySubject" text`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_people_identity" ON "people" ("identityIssuer", "identitySubject") WHERE "identityIssuer" IS NOT NULL`,
    );
    await q.query(`CREATE TABLE "instance_keys" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "kid" text NOT NULL,
      "alg" text NOT NULL DEFAULT 'RS256',
      "publicJwk" jsonb NOT NULL,
      "privateJwkEncrypted" text NOT NULL,
      "retiredAt" TIMESTAMP WITH TIME ZONE,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_instance_keys" PRIMARY KEY ("id"))`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_instance_keys_kid" ON "instance_keys" ("kid")`,
    );
    await q.query(`CREATE TABLE "oauth_clients" (
      "id" text NOT NULL,
      "name" text NOT NULL,
      "redirectUris" text array NOT NULL DEFAULT '{}',
      "tokenEndpointAuthMethod" text NOT NULL DEFAULT 'none',
      "secretHash" text,
      "registeredBy" text NOT NULL DEFAULT 'dcr',
      "grantTypes" text array NOT NULL DEFAULT '{authorization_code,refresh_token}',
      "disabledAt" TIMESTAMP WITH TIME ZONE,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_oauth_clients" PRIMARY KEY ("id"))`);
    await q.query(`CREATE TABLE "oauth_codes" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "codeHash" text NOT NULL,
      "clientId" text NOT NULL,
      "redirectUri" text NOT NULL,
      "codeChallenge" text NOT NULL,
      "codeChallengeMethod" text NOT NULL DEFAULT 'S256',
      "personId" uuid NOT NULL,
      "scope" text NOT NULL DEFAULT 'openid profile email',
      "nonce" text,
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "usedAt" TIMESTAMP WITH TIME ZONE,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_oauth_codes" PRIMARY KEY ("id"))`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_oauth_codes_hash" ON "oauth_codes" ("codeHash")`,
    );
    await q.query(`CREATE TABLE "oauth_refresh_tokens" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "tokenHash" text NOT NULL,
      "clientId" text NOT NULL,
      "personId" uuid NOT NULL,
      "scope" text NOT NULL DEFAULT 'openid profile email',
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "revokedAt" TIMESTAMP WITH TIME ZONE,
      "replacedById" uuid,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_oauth_refresh_tokens" PRIMARY KEY ("id"))`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_oauth_refresh_hash" ON "oauth_refresh_tokens" ("tokenHash")`,
    );
    await q.query(
      `CREATE INDEX "IDX_oauth_refresh_person" ON "oauth_refresh_tokens" ("personId")`,
    );
    await q.query(`CREATE TABLE "oauth_login_states" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "upstreamState" text NOT NULL,
      "request" jsonb NOT NULL,
      "upstreamNonce" text NOT NULL,
      "upstreamCodeVerifier" text NOT NULL,
      "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_oauth_login_states" PRIMARY KEY ("id"))`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_oauth_login_state" ON "oauth_login_states" ("upstreamState")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "oauth_login_states"`);
    await q.query(`DROP TABLE "oauth_refresh_tokens"`);
    await q.query(`DROP TABLE "oauth_codes"`);
    await q.query(`DROP TABLE "oauth_clients"`);
    await q.query(`DROP TABLE "instance_keys"`);
    await q.query(`DROP INDEX "IDX_people_identity"`);
    await q.query(`ALTER TABLE "people" DROP COLUMN "identitySubject"`);
    await q.query(`ALTER TABLE "people" DROP COLUMN "identityIssuer"`);
  }
}
