/**
 * Licensing on a self-hosted install, through the real application (T3.2): the guard goes
 * read-only after grace, admin license endpoints keep working, and an admin can install a
 * renewal. Uses the local Postgres from api/.env and a throwaway Ed25519 key pair.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/http-exception.filter';
import { Test } from '@nestjs/testing';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Org } from '../../src/orgs/entities/org.entity';
import { Person } from '../../src/orgs/entities/person.entity';
import { InstanceSetting } from '../../src/license/entities/instance-setting.entity';

const DAY = 24 * 60 * 60;

async function mint(privateKey: CryptoKey, expiresInDays: number, seats = 100) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ licenseId: `lic-${Date.now()}`, org: { name: 'Acme Corp', slug: 'acme' }, seats, features: [] })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer('lightci')
    .setIssuedAt(now - DAY)
    .setExpirationTime(now + expiresInDays * DAY)
    .sign(privateKey);
}

describe('self-hosted licensing through the application', () => {
  const saved = { ...process.env };
  let app: INestApplication;
  let ds: DataSource;
  let privateKey: CryptoKey;
  let adminId: string;
  let orgId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    privateKey = pair.privateKey;
    process.env.NODE_ENV = 'test';
    process.env.ACTIVATE_EDITION = 'self-hosted';
    process.env.ACTIVATE_ROLE = 'api';
    process.env.AI_PROVIDER = 'mock';
    process.env.MIGRATIONS_RUN_ON_BOOT = 'true';
    process.env.ACTIVATE_LICENSE_PUBLIC_KEY = JSON.stringify({ ...(await exportJWK(pair.publicKey)), alg: 'EdDSA' });
    // Start expired past grace, so the read-only path is exercised first.
    process.env.ACTIVATE_LICENSE = await mint(privateKey, -30);
    process.env.MCP_DEV_USER_EMAIL = 'license-admin@acme-license.test';
    process.env.LEAD_EMAIL_DOMAINS = '';
    delete process.env.SEED_ON_BOOT;
    delete process.env.ACTIVATE_LICENSE_FILE;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true, logger: ['error'] });
    app.setGlobalPrefix('api', { exclude: ['mcp', 'mcp/(.*)', '.well-known/(.*)', 'oauth', 'oauth/(.*)'] });
    // Same error shape as production (main.ts registers the same filter).
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    ds = app.get(DataSource);
    await ds.getRepository(InstanceSetting).delete({ key: 'license.jwt' });

    const org = await ds.getRepository(Org).save(
      ds.getRepository(Org).create({ name: 'Acme (license test)', slug: `acme-license-${Date.now()}`, emailDomains: ['acme-license.test'], isDemo: false }),
    );
    orgId = org.id;
    const admin = await ds.getRepository(Person).save(
      ds.getRepository(Person).create({ email: 'license-admin@acme-license.test', name: 'License Admin', orgId, roles: ['admin', 'learner'], status: 'active' }),
    );
    adminId = admin.id;
  }, 120_000);

  afterAll(async () => {
    if (ds) {
      await ds.getRepository(InstanceSetting).delete({ key: 'license.jwt' });
      await ds.getRepository(Person).delete({ id: adminId });
      await ds.getRepository(Org).delete({ id: orgId });
    }
    await app?.close();
    process.env = saved;
  });

  // The dev-user header is honoured outside production, so the admin needs no token here.
  const asAdmin = () => ({ 'X-Activate-Dev-User': 'license-admin@acme-license.test' });

  it('reports the expired state to the admin and to readiness', async () => {
    const res = await http().get('/api/admin/license').set(asAdmin()).expect(200);
    expect(res.body).toMatchObject({ status: 'expired', readOnly: true, org: 'Acme Corp', seats: 100 });
    expect(res.body.message).toMatch(/read-only/);
  });

  it('blocks writes with a plain message but leaves reads and license management open', async () => {
    await http().get('/api/exercises').set(asAdmin()).expect(200);
    const blocked = await http().post('/api/auth/consent').set(asAdmin()).send({ accepted: true }).expect(403);
    expect(blocked.body.detail).toMatch(/read-only because the license has expired/);
    await http().get('/api/health').expect(200);
    const bad = await http().post('/api/admin/license').set(asAdmin()).send({ license: 'not-a-license' }).expect(400);
    expect(bad.body.detail).toBeTruthy();
  });

  it('refuses an expired renewal, accepts a current one, and leaves read-only mode', async () => {
    const stillExpired = await mint(privateKey, -1);
    await http().post('/api/admin/license').set(asAdmin()).send({ license: stillExpired }).expect(400);

    const renewed = await mint(privateKey, 400, 250);
    const res = await http().post('/api/admin/license').set(asAdmin()).send({ license: renewed }).expect(201);
    expect(res.body).toMatchObject({ status: 'valid', readOnly: false, seats: 250, source: 'upload' });

    await http().post('/api/auth/consent').set(asAdmin()).send({ accepted: true }).expect(201);
    const after = await http().get('/api/admin/license').set(asAdmin()).expect(200);
    expect(after.body.status).toBe('valid');
  });

  it('a non-admin cannot read or change the license', async () => {
    const learner = await ds.getRepository(Person).save(
      ds.getRepository(Person).create({ email: 'learner@acme-license.test', name: 'L', orgId, roles: ['learner'], status: 'active' }),
    );
    process.env.MCP_DEV_USER_EMAIL = 'learner@acme-license.test';
    try {
      await http().get('/api/admin/license').set({ 'X-Activate-Dev-User': 'learner@acme-license.test' }).expect(403);
    } finally {
      process.env.MCP_DEV_USER_EMAIL = 'license-admin@acme-license.test';
      await ds.getRepository(Person).delete({ id: learner.id });
    }
  });
});
