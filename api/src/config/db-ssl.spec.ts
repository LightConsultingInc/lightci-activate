import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RDS_BUNDLE_PATH, buildSslOptions, isRdsHost } from './db-ssl';

describe('buildSslOptions (T0.3)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'activate-ca-'));
  const ca = join(dir, 'ca.pem');
  writeFileSync(
    ca,
    '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n',
  );

  it('disable turns TLS off; require encrypts without verifying', () => {
    expect(buildSslOptions('disable', undefined, 'db.internal')).toBe(false);
    expect(buildSslOptions('require', undefined, 'db.internal')).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('verify-full verifies the CA and the hostname', () => {
    const opts = buildSslOptions('verify-full', ca, 'db.internal');
    expect(opts).toMatchObject({ rejectUnauthorized: true });
    expect((opts as { ca: string }).ca).toContain('BEGIN CERTIFICATE');
    expect(
      (opts as { checkServerIdentity?: unknown }).checkServerIdentity,
    ).toBeUndefined();
  });

  it('verify-ca verifies the CA but skips the hostname check', () => {
    const opts = buildSslOptions('verify-ca', ca, 'db.internal') as {
      checkServerIdentity: () => unknown;
    };
    expect(typeof opts.checkServerIdentity).toBe('function');
    expect(opts.checkServerIdentity()).toBeUndefined();
  });

  it('verify modes need a CA bundle unless the host is RDS', () => {
    expect(() =>
      buildSslOptions('verify-full', undefined, 'db.internal'),
    ).toThrow(/DB_SSL_CA_FILE/);
    expect(isRdsHost('x.cluster-abc.us-east-1.rds.amazonaws.com')).toBe(true);
    expect(isRdsHost('db.internal')).toBe(false);
    const opts = buildSslOptions(
      'verify-full',
      undefined,
      'x.cluster-abc.us-east-1.rds.amazonaws.com',
    ) as { ca: string };
    expect(opts.ca).toContain('BEGIN CERTIFICATE');
    expect(RDS_BUNDLE_PATH).toMatch(/certs[/\\]rds-global-bundle\.pem$/);
  });
});
