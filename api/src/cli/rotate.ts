import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InstanceKey } from '../auth/oauth/entities/instance-key.entity';
import { KeysService } from '../auth/oauth/keys.service';
import { SecretsService } from '../common/secrets.service';
import { OrgIntegration } from '../orgs/entities/org-integration.entity';

export interface RotateResult {
  integrations: { total: number; rotated: number; failed: number };
  signingKeys: { total: number; rotated: number; failed: number };
}

/**
 * Re-encrypt everything stored under ACTIVATE_SECRETS_KEY_PREVIOUS with the current
 * ACTIVATE_SECRETS_KEY: client credentials in org_integrations and the token signing keys.
 * Idempotent; rows already on the current key are left alone. After it reports zero
 * remaining, the previous key can be dropped from configuration.
 */
export async function rotateSecrets(
  app: INestApplicationContext,
): Promise<RotateResult> {
  const ds = app.get(DataSource);
  const secrets = app.get(SecretsService);
  const result: RotateResult = {
    integrations: { total: 0, rotated: 0, failed: 0 },
    signingKeys: { total: 0, rotated: 0, failed: 0 },
  };

  const integrations = ds.getRepository(OrgIntegration);
  for (const row of await integrations.find()) {
    result.integrations.total += 1;
    try {
      if (!secrets.needsRotation(row.encryptedSecret)) continue;
      row.encryptedSecret = secrets.reencrypt(row.encryptedSecret);
      await integrations.save(row);
      result.integrations.rotated += 1;
    } catch {
      result.integrations.failed += 1;
    }
  }

  const keys = ds.getRepository(InstanceKey);
  for (const row of await keys.find()) {
    result.signingKeys.total += 1;
    try {
      if (!secrets.needsRotation(row.privateJwkEncrypted)) continue;
      row.privateJwkEncrypted = secrets.reencrypt(row.privateJwkEncrypted);
      await keys.save(row);
      result.signingKeys.rotated += 1;
    } catch {
      result.signingKeys.failed += 1;
    }
  }
  app.get(KeysService).reset();
  return result;
}
