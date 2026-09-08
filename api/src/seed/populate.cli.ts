/**
 * Fill an existing org with renamed demo data so Library, Team and Mission Control look live.
 * Usage: node dist/seed/populate.cli.js <orgId> "<Firm Name>" <ShortName> <email-domain>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';

async function main(): Promise<void> {
  const [
    orgId,
    firmName = 'Demo Firm',
    shortName = firmName.split(' ')[0],
    domain = 'demo.local',
  ] = process.argv.slice(2);
  if (!orgId) throw new Error('orgId is required');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app
      .get(SeedService)
      .populateOrg(orgId, { firmName, shortName, domain });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
