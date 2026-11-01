/**
 * Encryption key rotation against the local Postgres from api/.env (T0.2, T3.6): rows written
 * under key A are re-encrypted under key B once A is listed as a previous key.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { InstanceKey } from '../../src/auth/oauth/entities/instance-key.entity';
import { SecretsService } from '../../src/common/secrets.service';
import { OrgIntegration } from '../../src/orgs/entities/org-integration.entity';
import { Org } from '../../src/orgs/entities/org.entity';
import AppDataSource from '../../src/typeorm.config';

/** The rotation routine with its dependencies passed explicitly (same logic the CLI runs). */
async function rotate(ds: DataSource, secrets: SecretsService) {
  const result = {
    integrations: { total: 0, rotated: 0, failed: 0 },
    signingKeys: { total: 0, rotated: 0, failed: 0 },
  };
  for (const row of await ds.getRepository(OrgIntegration).find()) {
    result.integrations.total += 1;
    try {
      if (!secrets.needsRotation(row.encryptedSecret)) continue;
      row.encryptedSecret = secrets.reencrypt(row.encryptedSecret);
      await ds.getRepository(OrgIntegration).save(row);
      result.integrations.rotated += 1;
    } catch {
      result.integrations.failed += 1;
    }
  }
  for (const row of await ds.getRepository(InstanceKey).find()) {
    result.signingKeys.total += 1;
    try {
      if (!secrets.needsRotation(row.privateJwkEncrypted)) continue;
      row.privateJwkEncrypted = secrets.reencrypt(row.privateJwkEncrypted);
      await ds.getRepository(InstanceKey).save(row);
      result.signingKeys.rotated += 1;
    } catch {
      result.signingKeys.failed += 1;
    }
  }
  return result;
}

describe('secrets rotation', () => {
  const ds = new DataSource({ ...AppDataSource.options, migrationsRun: false });
  const saved = { ...process.env };
  let orgId: string;

  beforeAll(async () => {
    await ds.initialize();
    const org = await ds.getRepository(Org).save(
      ds.getRepository(Org).create({
        name: 'Rotate test',
        slug: `rotate-${Date.now()}`,
        isDemo: false,
      }),
    );
    orgId = org.id;
  });

  afterAll(async () => {
    await ds.getRepository(OrgIntegration).delete({ orgId });
    await ds.getRepository(Org).delete({ id: orgId });
    await ds.destroy();
    process.env = saved;
  });

  it('re-encrypts rows written under the previous key and leaves current ones alone', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ACTIVATE_SECRETS_KEY = 'key-A';
    delete process.env.ACTIVATE_SECRETS_KEY_PREVIOUS;
    const a = new SecretsService();
    const repo = ds.getRepository(OrgIntegration);
    await repo.save(
      repo.create({
        orgId,
        kind: 'github',
        encryptedSecret: a.encrypt('ghp_under_A'),
        last4: 'er_A',
        status: 'verified',
        config: {},
      }),
    );

    // Rotate to B with A as previous.
    process.env.ACTIVATE_SECRETS_KEY = 'key-B';
    process.env.ACTIVATE_SECRETS_KEY_PREVIOUS = 'key-A';
    const b = new SecretsService();
    const first = await rotate(ds, b);
    // Other rows in a shared database may sit under keys this test does not know; judge ours.
    expect(first.integrations.rotated).toBeGreaterThanOrEqual(1);
    const row = await repo.findOneByOrFail({ orgId, kind: 'github' });
    expect(b.needsRotation(row.encryptedSecret)).toBe(false);
    expect(b.decrypt(row.encryptedSecret)).toBe('ghp_under_A');

    // A second pass has nothing to do for our row.
    const second = await rotate(ds, b);
    expect(second.integrations.rotated).toBe(0);

    // Without the previous key, B alone still reads the rotated row.
    delete process.env.ACTIVATE_SECRETS_KEY_PREVIOUS;
    const bOnly = new SecretsService();
    expect(
      bOnly.decrypt(
        (await repo.findOneByOrFail({ orgId, kind: 'github' })).encryptedSecret,
      ),
    ).toBe('ghp_under_A');
  });
});
