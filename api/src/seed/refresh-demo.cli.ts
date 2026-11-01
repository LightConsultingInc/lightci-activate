/**
 * Regenerate demo data with today's dates without touching real people.
 *   node dist/seed/refresh-demo.cli.js meridian
 *   node dist/seed/refresh-demo.cli.js <orgId> "<Firm Name>" <ShortName> <domain> keep@one.com,keep@two.com
 * The demo firm (slug "meridian") is dropped and reseeded whole. Any other org is purged of everything
 * except the kept people and what hangs off them, then populated again with renamed demo data.
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { Org } from '../orgs/entities/org.entity';
import { DEMO_ORG } from './demo-data';
import { SeedService } from './seed.service';

async function main(): Promise<void> {
  const [target, firmName, shortName, domain, keepCsv] = process.argv.slice(2);
  if (!target) throw new Error('org slug or id is required');
  // The purge must run before any reseed, so the boot-time seed stays off in this process.
  process.env.SEED_ON_BOOT = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const seed = app.get(SeedService);
    const orgs = app.get(DataSource).getRepository(Org);
    if (target === DEMO_ORG.slug) {
      const org = await orgs.findOne({ where: { slug: DEMO_ORG.slug } });
      if (org) await seed.purgeOrg(org.id, { dropOrg: true });
      // A half-finished earlier refresh can leave the plan's org-less lead (and its rows) behind; the reseed recreates them.
      else await seed.purgeOrphans();
      await seed.run();
      console.log(JSON.stringify({ reseeded: DEMO_ORG.slug }));
      return;
    }
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        target,
      );
    const org = await orgs.findOne({
      where: isUuid ? { id: target } : { slug: target },
    });
    if (!org) throw new Error(`No org ${target}`);
    const keepEmails = (keepCsv ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const purged = await seed.purgeOrg(org.id, { keepEmails });
    const result = await seed.populateOrg(org.id, {
      firmName: firmName ?? org.name,
      shortName: shortName ?? (firmName ?? org.name).split(' ')[0],
      domain: domain ?? 'demo.local',
    });
    console.log(
      JSON.stringify({
        org: org.slug,
        kept: keepEmails,
        purged: purged.deleted,
        ...result,
      }),
    );
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
