/**
 * Update awareness on a self-hosted install (T7.4): the worker's daily check reads a release index,
 * the admin endpoint and banner data say "X is available", a security advisory is flagged, and with
 * UPDATE_CHECK_ENABLED=false no request leaves the process. The index is served by a real local
 * HTTP server that counts requests; the application runs against the local Postgres from api/.env.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/http-exception.filter';
import { JOBS, type JobsPort } from '../../src/jobs/jobs.port';
import { InstanceSetting } from '../../src/license/entities/instance-setting.entity';
import { Org } from '../../src/orgs/entities/org.entity';
import { Person } from '../../src/orgs/entities/person.entity';
import { UpdateCheckService } from '../../src/updates/update-check.service';
import { APP_VERSION } from '../../src/updates/version';

const bump = (v: string, part: 'minor' | 'patch') => {
  const [a, b, c] = v.split('.').map(Number);
  return part === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
};

describe('update check through the application', () => {
  const saved = { ...process.env };
  let app: INestApplication;
  let ds: DataSource;
  let index: Server;
  let indexUrl: string;
  let requests = 0;
  let body: unknown;
  let adminId: string;
  let orgId: string;
  const http = () => request(app.getHttpServer());
  const asAdmin = { 'X-Activate-Dev-User': 'updates-admin@acme-updates.test' };

  beforeAll(async () => {
    index = createServer((req, res) => {
      requests += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    await new Promise<void>((r) => index.listen(0, '127.0.0.1', r));
    indexUrl = `http://127.0.0.1:${(index.address() as AddressInfo).port}/activate/index.json`;

    // A self-hosted install refuses to boot without a valid licence: mint one with a throwaway key.
    const pair = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    const now = Math.floor(Date.now() / 1000);
    process.env.ACTIVATE_LICENSE_PUBLIC_KEY = JSON.stringify({
      ...(await exportJWK(pair.publicKey)),
      alg: 'EdDSA',
    });
    process.env.ACTIVATE_LICENSE = await new SignJWT({
      licenseId: `lic-updates-${Date.now()}`,
      org: { name: 'Acme Updates', slug: 'acme-updates' },
      seats: 100,
      features: [],
    })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setIssuer('lightci')
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 365 * 24 * 60 * 60)
      .sign(pair.privateKey);
    process.env.NODE_ENV = 'test';
    process.env.ACTIVATE_EDITION = 'self-hosted';
    process.env.ACTIVATE_ROLE = 'api';
    process.env.AI_PROVIDER = 'mock';
    process.env.MIGRATIONS_RUN_ON_BOOT = 'true';
    process.env.METRICS_PORT = '0';
    process.env.UPDATE_INDEX_URL = indexUrl;
    delete process.env.UPDATE_CHECK_ENABLED;
    process.env.MCP_DEV_USER_EMAIL = 'updates-admin@acme-updates.test';
    process.env.LEAD_EMAIL_DOMAINS = '';
    delete process.env.SEED_ON_BOOT;
    delete process.env.ACTIVATE_LICENSE_FILE;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: ['error'] });
    app.setGlobalPrefix('api', {
      exclude: ['mcp', 'mcp/(.*)', '.well-known/(.*)', 'oauth', 'oauth/(.*)'],
    });
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    ds = app.get(DataSource);
    const org = await ds.getRepository(Org).save(
      ds.getRepository(Org).create({
        name: 'Acme Updates',
        slug: `acme-updates-${Date.now()}`,
        isDemo: false,
      }),
    );
    orgId = org.id;
    const admin = await ds.getRepository(Person).save(
      ds.getRepository(Person).create({
        email: 'updates-admin@acme-updates.test',
        name: 'Updates Admin',
        orgId,
        roles: ['admin', 'learner'],
        status: 'active',
      }),
    );
    adminId = admin.id;
  }, 120_000);

  afterAll(async () => {
    await ds?.getRepository(InstanceSetting).delete({ key: 'updates.status' });
    if (adminId) await ds.getRepository(Person).delete({ id: adminId });
    if (orgId) await ds.getRepository(Org).delete({ id: orgId });
    await app?.close();
    await new Promise<void>((r) => index.close(() => r()));
    process.env = saved;
  });

  it('is quiet when the index says we are current', async () => {
    body = {
      product: 'activate',
      latest: APP_VERSION,
      releases: [
        {
          version: APP_VERSION,
          date: '2026-11-01',
          notes: 'https://example.test/notes/current',
        },
      ],
    };
    const before = requests;
    const s = await app.get(UpdateCheckService).check();
    expect(requests).toBe(before + 1);
    expect(s.enabled).toBe(true);
    expect(s.updateAvailable).toBe(false);
    expect(s.message).toBeNull();
    const res = await http().get('/api/admin/updates').set(asAdmin).expect(200);
    expect(res.body.current).toBe(APP_VERSION);
    expect(res.body.updateAvailable).toBe(false);
  });

  it('tells the admin a newer release exists, and flags a security advisory', async () => {
    const next = bump(APP_VERSION, 'minor');
    const patch = bump(APP_VERSION, 'patch');
    body = {
      product: 'activate',
      latest: next,
      releases: [
        {
          version: next,
          date: '2026-12-01',
          notes: `https://example.test/notes/${next}`,
        },
        {
          version: patch,
          date: '2026-11-15',
          notes: `https://example.test/notes/${patch}`,
          advisory: true,
        },
        {
          version: APP_VERSION,
          date: '2026-11-01',
          notes: 'https://example.test/notes/current',
        },
      ],
    };
    const res = await http()
      .post('/api/admin/updates/check')
      .set(asAdmin)
      .expect(201);
    expect(res.body.updateAvailable).toBe(true);
    expect(res.body.latest).toBe(next);
    expect(res.body.advisory).toBe(true);
    expect(res.body.notesUrl).toBe(`https://example.test/notes/${next}`);
    expect(res.body.message).toContain(next);
    expect(res.body.message).toMatch(/security/i);
    // Persisted: a fresh read (what the banner fetches) says the same.
    const again = await http()
      .get('/api/admin/updates')
      .set(asAdmin)
      .expect(200);
    expect(again.body.latest).toBe(next);
    expect(again.body.checkedAt).toBeTruthy();
  });

  it('keeps the last known state and records the error when the index is unreachable', async () => {
    process.env.UPDATE_INDEX_URL = 'http://127.0.0.1:9/index.json';
    try {
      const s = await app.get(UpdateCheckService).check();
      expect(s.error).toBeTruthy();
      expect(s.latest).toBe(bump(APP_VERSION, 'minor'));
    } finally {
      process.env.UPDATE_INDEX_URL = indexUrl;
    }
  });

  it('UPDATE_CHECK_ENABLED=false sends nothing and shows nothing', async () => {
    process.env.UPDATE_CHECK_ENABLED = 'false';
    try {
      const before = requests;
      const s = await app.get(UpdateCheckService).check();
      expect(requests).toBe(before);
      expect(s.enabled).toBe(false);
      expect(s.message).toBeNull();
      const res = await http()
        .get('/api/admin/updates')
        .set(asAdmin)
        .expect(200);
      expect(res.body.enabled).toBe(false);
    } finally {
      delete process.env.UPDATE_CHECK_ENABLED;
    }
  });

  it('a learner cannot read update status; the daily job is registered and queued on boot for workers only', async () => {
    const learner = await ds.getRepository(Person).save(
      ds.getRepository(Person).create({
        email: 'updates-learner@acme-updates.test',
        name: 'Learner',
        orgId,
        roles: ['learner'],
        status: 'active',
      }),
    );
    try {
      // The dev-user header only impersonates the configured dev user.
      process.env.MCP_DEV_USER_EMAIL = learner.email;
      await http()
        .get('/api/admin/updates')
        .set({ 'X-Activate-Dev-User': learner.email })
        .expect(403);
    } finally {
      process.env.MCP_DEV_USER_EMAIL = 'updates-admin@acme-updates.test';
      await ds.getRepository(Person).delete({ id: learner.id });
    }
    // The api role installs the queue but does not enqueue the boot run (that is the worker's job).
    const jobs = app.get<JobsPort>(JOBS);
    expect(await jobs.isPending('updates.check', 'boot')).toBe(false);
  });
});
