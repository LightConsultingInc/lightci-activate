import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DbSslMode } from './env';

/** What node-postgres hands to tls.connect(). */
export interface DbSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
  checkServerIdentity?: () => undefined;
}

/** The AWS RDS global CA bundle shipped in the image (api/certs). Used when no DB_SSL_CA_FILE is given for an RDS host. */
export const RDS_BUNDLE_PATH = join(
  __dirname,
  '..',
  '..',
  'certs',
  'rds-global-bundle.pem',
);

export function isRdsHost(host: string | undefined): boolean {
  return Boolean(host && /\.rds\.amazonaws\.com$/i.test(host));
}

export function defaultCaFile(host: string | undefined): string | undefined {
  return isRdsHost(host) && existsSync(RDS_BUNDLE_PATH)
    ? RDS_BUNDLE_PATH
    : undefined;
}

/**
 * Translate a libpq-style sslmode into node-postgres TLS options.
 *   disable      no TLS
 *   require      TLS, no certificate verification
 *   verify-ca    TLS, CA verified, hostname not checked
 *   verify-full  TLS, CA verified, hostname checked
 */
export function buildSslOptions(
  mode: DbSslMode,
  caFile: string | undefined,
  host?: string,
): false | DbSslOptions {
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  const ca = caFile ?? defaultCaFile(host);
  if (!ca)
    throw new Error(
      `DB_SSL_MODE=${mode} needs a CA bundle: set DB_SSL_CA_FILE (the RDS bundle is used automatically for *.rds.amazonaws.com hosts).`,
    );
  const options: DbSslOptions = {
    rejectUnauthorized: true,
    ca: readFileSync(ca, 'utf8'),
  };
  if (mode === 'verify-ca') options.checkServerIdentity = () => undefined;
  return options;
}
