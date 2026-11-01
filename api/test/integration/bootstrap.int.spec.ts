/** First-boot provisioning against the local Postgres from api/.env (T3.1). */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
  BootstrapService,
  bootstrapConfig,
} from '../../src/bootstrap/bootstrap.service';
import { COMPETENCY_CATALOG } from '../../src/learning/competency-catalog';
import { Competency } from '../../src/learning/entities/competency.entity';
import { AuditLog } from '../../src/ops/entities/audit-log.entity';
import { CostInput } from '../../src/ops/entities/cost-input.entity';
import { Org } from '../../src/orgs/entities/org.entity';
import { Person } from '../../src/orgs/entities/person.entity';
import AppDataSource from '../../src/typeorm.config';

describe('BootstrapService', () => {
  const ds = new DataSource({ ...AppDataSource.options, migrationsRun: false });
  const slug = `acme-boot-${Date.now()}`;
  const saved = { ...process.env };
  let orgId: string | null = null;

  beforeAll(async () => {
    await ds.initialize();
    process.env.ACTIVATE_EDITION = 'self-hosted';
    process.env.ACTIVATE_ORG_NAME = 'Acme Corp (bootstrap test)';
    process.env.ACTIVATE_ORG_SLUG = slug;
    process.env.ACTIVATE_ORG_EMAIL_DOMAINS =
      'acme-boot.test, Ops.Acme-Boot.test';
    process.env.ACTIVATE_ORG_INITIAL_ADMINS =
      'jane.doe@acme-boot.test, it@acme-boot.test';
    process.env.ACTIVATE_ORG_SEATS = '250';
    process.env.LIBRARY_PROVIDER = 'github';
    process.env.LIBRARY_REPOSITORY = 'acme/claude-marketplace';
    process.env.LIBRARY_GIT_TOKEN = 'ghp_test';
  });

  afterAll(async () => {
    if (orgId) {
      await ds.getRepository(Person).delete({ orgId });
      await ds.getRepository(CostInput).delete({ orgId });
      await ds.getRepository(AuditLog).delete({ orgId });
      await ds.getRepository(Org).delete({ id: orgId });
    }
    await ds.destroy();
    process.env = saved;
  });

  it('reads the configuration from the environment', () => {
    expect(bootstrapConfig()).toEqual({
      name: 'Acme Corp (bootstrap test)',
      slug,
      emailDomains: ['acme-boot.test', 'ops.acme-boot.test'],
      initialAdmins: ['jane.doe@acme-boot.test', 'it@acme-boot.test'],
      seats: 250,
    });
    expect(bootstrapConfig({})).toBeNull();
  });

  it('creates the catalogue, the organisation, its cost inputs, audit row and admins', async () => {
    const svc = new BootstrapService(ds);
    const result = await svc.run();
    expect(result.org).toMatchObject({ slug, created: true });
    orgId = result.org!.id;
    expect(result.admins.created.sort()).toEqual([
      'it@acme-boot.test',
      'jane.doe@acme-boot.test',
    ]);

    const org = await ds.getRepository(Org).findOneByOrFail({ id: orgId });
    expect(org.emailDomains).toEqual(['acme-boot.test', 'ops.acme-boot.test']);
    expect(org.residencyMode).toBe('client_hosted');
    expect(org.isDemo).toBe(false);
    expect(org.seats).toBe(250);
    expect(org.settings.identity?.roleMapping?.admin).toContain(
      'activate-admin',
    );
    expect(org.marketplaceRepo).toMatchObject({
      provider: 'github',
      owner: 'acme',
      repo: 'claude-marketplace',
    });
    expect(await ds.getRepository(CostInput).countBy({ orgId })).toBe(1);
    expect(
      await ds
        .getRepository(AuditLog)
        .countBy({ orgId, action: 'org.created' }),
    ).toBe(1);

    const admins = await ds.getRepository(Person).findBy({ orgId });
    expect(admins).toHaveLength(2);
    for (const a of admins) {
      expect(a.roles).toEqual(['admin', 'sponsor', 'learner']);
      expect(a.status).toBe('invited');
    }
    const catalogue = await ds.getRepository(Competency).count();
    expect(catalogue).toBeGreaterThanOrEqual(COMPETENCY_CATALOG.length);
  });

  it('is idempotent: a second run changes nothing and reports what already exists', async () => {
    const svc = new BootstrapService(ds);
    const result = await svc.run();
    expect(result.org).toMatchObject({ slug, created: false });
    expect(result.admins.created).toEqual([]);
    expect(result.admins.existing.sort()).toEqual([
      'it@acme-boot.test',
      'jane.doe@acme-boot.test',
    ]);
    expect(result.catalogue.inserted).toBe(0);
    expect(await ds.getRepository(Person).countBy({ orgId: orgId! })).toBe(2);
  });

  it('keeps admin on an initial admin even if an earlier change removed it, and adds new domains', async () => {
    const people = ds.getRepository(Person);
    const jane = await people.findOneByOrFail({
      email: 'jane.doe@acme-boot.test',
    });
    jane.roles = ['learner'];
    await people.save(jane);
    process.env.ACTIVATE_ORG_EMAIL_DOMAINS =
      'acme-boot.test, ops.acme-boot.test, eu.acme-boot.test';
    await new BootstrapService(ds).run();
    expect(
      (await people.findOneByOrFail({ email: 'jane.doe@acme-boot.test' }))
        .roles,
    ).toEqual(['admin', 'learner']);
    expect(
      (await ds.getRepository(Org).findOneByOrFail({ id: orgId! }))
        .emailDomains,
    ).toContain('eu.acme-boot.test');
  });
});
