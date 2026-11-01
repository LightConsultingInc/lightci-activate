import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { parseEmailDomains } from '../auth/email-domains';
import { edition, processRole } from '../config/env';
import { Competency } from '../learning/entities/competency.entity';
import { COMPETENCY_CATALOG } from '../learning/competency-catalog';
import { CostInput } from '../ops/entities/cost-input.entity';
import { AuditLog } from '../ops/entities/audit-log.entity';
import { Org, type MarketplaceRepo } from '../orgs/entities/org.entity';
import { Person } from '../orgs/entities/person.entity';
import { defaultOrgSettings } from '../orgs/org-defaults';
import { slugify } from '../orgs/org.service';
import { marketplaceEnv } from '../skills/git-repo.service';

export interface BootstrapConfig {
  name: string;
  slug: string;
  emailDomains: string[];
  initialAdmins: string[];
  seats: number;
}

export interface BootstrapResult {
  catalogue: { inserted: number; updated: number };
  org: { id: string; slug: string; created: boolean } | null;
  admins: { created: string[]; existing: string[] };
}

/** Read the first-boot configuration from the environment; null when none is set. */
export function bootstrapConfig(
  env: Record<string, string | undefined> = process.env,
): BootstrapConfig | null {
  const slug = env.ACTIVATE_ORG_SLUG?.trim();
  const name = env.ACTIVATE_ORG_NAME?.trim();
  if (!slug && !name) return null;
  return {
    name: name || slug!,
    slug: slugify(slug || name!),
    emailDomains: parseEmailDomains(env.ACTIVATE_ORG_EMAIL_DOMAINS),
    initialAdmins: (env.ACTIVATE_ORG_INITIAL_ADMINS ?? '')
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@')),
    seats: Number(env.ACTIVATE_ORG_SEATS ?? 0) || 0,
  };
}

/** The marketplace repo descriptor the instance-level environment describes, if any. */
export function marketplaceFromEnv(): MarketplaceRepo | null {
  const mp = marketplaceEnv();
  if (mp.provider === 'github' && mp.repository) {
    const [owner, repo] = mp.repository.split('/');
    return {
      provider: 'github',
      owner,
      repo,
      defaultBranch: mp.defaultBranch,
      autoSync: true,
    };
  }
  if (mp.provider === 'git' && mp.remoteUrl)
    return {
      provider: 'git',
      url: mp.remoteUrl,
      defaultBranch: mp.defaultBranch,
      autoSync: true,
    };
  return null;
}

/**
 * First boot without the demo seed: the competency catalogue every install needs, and (when
 * ACTIVATE_ORG_* is set) the customer's organisation with its initial admins. Idempotent and
 * advisory-locked, so several replicas starting together do it once. Runs on the worker (or
 * `all`) role at bootstrap and from `activate bootstrap`.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (processRole() === 'api') return;
    try {
      const result = await this.run();
      if (result.org?.created)
        this.logger.log(
          `Bootstrapped organisation ${result.org.slug} with ${result.admins.created.length} admin(s)`,
        );
    } catch (e) {
      this.logger.error(
        `Bootstrap failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      if (edition() === 'self-hosted') throw e;
    }
  }

  async run(
    config: BootstrapConfig | null = bootstrapConfig(),
  ): Promise<BootstrapResult> {
    return this.ds.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'activate:bootstrap',
      ]);
      const catalogue = await this.ensureCatalogue(m);
      if (!config)
        return { catalogue, org: null, admins: { created: [], existing: [] } };
      return { catalogue, ...(await this.ensureOrg(m, config)) };
    });
  }

  /** Upsert the competency catalogue by code; content changes in a release land on upgrade. */
  async ensureCatalogue(
    m: EntityManager,
  ): Promise<{ inserted: number; updated: number }> {
    const repo = m.getRepository(Competency);
    const existing = new Map((await repo.find()).map((c) => [c.code, c]));
    let inserted = 0;
    let updated = 0;
    for (const c of COMPETENCY_CATALOG) {
      const row = existing.get(c.code);
      const values = {
        code: c.code,
        rung: c.rung,
        name: c.name,
        description: c.description,
        rubric: c.rubric,
        orderIndex: c.orderIndex,
        minContexts: c.minContexts,
        masteryThreshold: c.masteryThreshold,
      };
      if (!row) {
        await repo.save(repo.create(values));
        inserted += 1;
      } else if (
        JSON.stringify({ ...row, id: undefined }) !==
        JSON.stringify({ ...row, ...values, id: undefined })
      ) {
        await repo.save({ ...row, ...values });
        updated += 1;
      }
    }
    return { inserted, updated };
  }

  private async ensureOrg(
    m: EntityManager,
    config: BootstrapConfig,
  ): Promise<{
    org: BootstrapResult['org'];
    admins: BootstrapResult['admins'];
  }> {
    const orgs = m.getRepository(Org);
    let org = await orgs.findOne({ where: { slug: config.slug } });
    let created = false;
    if (!org) {
      org = await orgs.save(
        orgs.create({
          name: config.name,
          slug: config.slug,
          emailDomains: config.emailDomains,
          workosOrganizationId: null,
          residencyMode:
            edition() === 'self-hosted' ? 'client_hosted' : 'lightci_hosted',
          settings: defaultOrgSettings(),
          marketplaceRepo: marketplaceFromEnv(),
          seats: config.seats,
          premiumSeats: 0,
          isDemo: false,
        }),
      );
      await m
        .getRepository(CostInput)
        .save(m.getRepository(CostInput).create({ orgId: org.id }));
      await m.getRepository(AuditLog).save(
        m.getRepository(AuditLog).create({
          orgId: org.id,
          actorPersonId: null,
          action: 'org.created',
          subjectType: 'org',
          subjectId: org.id,
          meta: {
            slug: org.slug,
            seats: org.seats,
            source: 'bootstrap',
            emailDomains: config.emailDomains,
          },
        }),
      );
      created = true;
    } else {
      // Keep domains and the marketplace in step with configuration; never shrink what an admin added.
      const domains = new Set([...org.emailDomains, ...config.emailDomains]);
      const marketplace = org.marketplaceRepo ?? marketplaceFromEnv();
      if (
        domains.size !== org.emailDomains.length ||
        marketplace !== org.marketplaceRepo
      ) {
        org.emailDomains = [...domains];
        org.marketplaceRepo = marketplace;
        await orgs.save(org);
      }
    }
    const people = m.getRepository(Person);
    const admins: BootstrapResult['admins'] = { created: [], existing: [] };
    for (const email of config.initialAdmins) {
      const person = await people.findOne({ where: { email } });
      if (person) {
        // Initial admins keep admin whatever their IdP groups say (break-glass).
        if (!person.roles.includes('admin')) {
          person.roles = ['admin', ...person.roles];
          await people.save(person);
        }
        admins.existing.push(email);
        continue;
      }
      await people.save(
        people.create({
          email,
          name: email.split('@')[0],
          orgId: org.id,
          roles: ['admin', 'sponsor', 'learner'],
          status: 'invited',
        }),
      );
      admins.created.push(email);
    }
    return { org: { id: org.id, slug: org.slug, created }, admins };
  }
}
