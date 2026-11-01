import {
  checkEnv,
  dbSslMode,
  edition,
  leadEmailDomains,
  migrationsRunOnBoot,
  processRole,
  seedEnabled,
} from './env';

const prodBase = {
  NODE_ENV: 'production',
  ACTIVATE_SECRETS_KEY: 'k',
  DB: JSON.stringify({ host: 'db.cluster-x.us-east-1.rds.amazonaws.com' }),
  WEB_URL: 'https://activate.example.com',
  PUBLIC_API_URL: 'https://api.activate.example.com',
  WORKOS_API_KEY: 'sk',
  WORKOS_CLIENT_ID: 'client',
};

describe('edition, role and derived defaults (T0.1)', () => {
  it('defaults to the cloud edition running every role', () => {
    expect(edition({})).toBe('cloud');
    expect(processRole({})).toBe('all');
    expect(processRole({ ACTIVATE_ROLE: 'worker' })).toBe('worker');
  });

  it('lead domains: lightci.com for cloud, none for self-hosted, explicit wins', () => {
    expect(leadEmailDomains({})).toEqual(['lightci.com']);
    expect(leadEmailDomains({ ACTIVATE_EDITION: 'self-hosted' })).toEqual([]);
    expect(
      leadEmailDomains({ LEAD_EMAIL_DOMAINS: 'Acme.com, ops.acme.com' }),
    ).toEqual(['acme.com', 'ops.acme.com']);
  });

  it('seed is available in cloud non-production, or when explicitly allowed', () => {
    expect(seedEnabled({})).toBe(true);
    expect(seedEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(seedEnabled({ ACTIVATE_EDITION: 'self-hosted' })).toBe(false);
    expect(
      seedEnabled({ NODE_ENV: 'production', ACTIVATE_ALLOW_SEED: 'true' }),
    ).toBe(true);
  });

  it('migrations run on boot outside production unless overridden', () => {
    expect(migrationsRunOnBoot({})).toBe(true);
    expect(migrationsRunOnBoot({ NODE_ENV: 'production' })).toBe(false);
    expect(
      migrationsRunOnBoot({
        NODE_ENV: 'production',
        MIGRATIONS_RUN_ON_BOOT: 'true',
      }),
    ).toBe(true);
    expect(migrationsRunOnBoot({ MIGRATIONS_RUN_ON_BOOT: 'false' })).toBe(
      false,
    );
  });

  it('DB TLS mode: local disables, remote verifies, DB_SSL alias still works', () => {
    expect(dbSslMode({}, 'localhost')).toBe('disable');
    expect(dbSslMode({}, 'db.internal')).toBe('verify-full');
    expect(dbSslMode({ DB_SSL: 'true' }, 'localhost')).toBe('require');
    expect(dbSslMode({ DB_SSL: 'false' }, 'db.internal')).toBe('disable');
    expect(dbSslMode({ DB_SSL_MODE: 'verify-ca', DB_SSL: 'false' })).toBe(
      'verify-ca',
    );
  });
});

describe('checkEnv (T0.1)', () => {
  it('passes a complete production configuration', () => {
    expect(checkEnv(prodBase).errors).toEqual([]);
  });

  it.each([
    ['ACTIVATE_SECRETS_KEY', 'ACTIVATE_SECRETS_KEY is required'],
    ['WEB_URL', 'WEB_URL is required'],
    ['PUBLIC_API_URL', 'PUBLIC_API_URL is required'],
    ['WORKOS_API_KEY', 'WORKOS_API_KEY is required'],
    ['WORKOS_CLIENT_ID', 'WORKOS_CLIENT_ID is required'],
  ])('names %s when it is missing in production', (key, message) => {
    const env = { ...prodBase } as Record<string, string | undefined>;
    delete env[key];
    const { errors } = checkEnv(env);
    expect(errors.some((e) => e.includes(message))).toBe(true);
  });

  it('requires database credentials when no DB secret is given', () => {
    const env = { ...prodBase } as Record<string, string | undefined>;
    delete env.DB;
    const { errors } = checkEnv(env);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DB_HOST'),
        expect.stringContaining('DB_PASSWORD'),
      ]),
    );
  });

  it('a worker needs no public URLs or WorkOS keys', () => {
    const env = { ...prodBase, ACTIVATE_ROLE: 'worker' } as Record<
      string,
      string | undefined
    >;
    delete env.WEB_URL;
    delete env.PUBLIC_API_URL;
    delete env.WORKOS_API_KEY;
    expect(checkEnv(env).errors).toEqual([]);
  });

  it('reports every problem at once', () => {
    const { errors } = checkEnv({ NODE_ENV: 'production' });
    expect(errors.length).toBeGreaterThanOrEqual(5);
  });

  it.each([
    [{ SEED_ON_BOOT: 'true' }, 'SEED_ON_BOOT=true is refused'],
    [{ MCP_DEV_USER_EMAIL: 'a@b.c' }, 'MCP_DEV_USER_EMAIL'],
    [{ AI_PROVIDER: 'mock' }, 'AI_PROVIDER=mock'],
  ])('refuses development switch %j in production', (extra, message) => {
    const { errors } = checkEnv({ ...prodBase, ...extra });
    expect(errors.some((e) => e.includes(message))).toBe(true);
  });

  it('allows SEED_ON_BOOT in production only with ACTIVATE_ALLOW_SEED', () => {
    const { errors } = checkEnv({
      ...prodBase,
      SEED_ON_BOOT: 'true',
      ACTIVATE_ALLOW_SEED: 'true',
    });
    expect(errors).toEqual([]);
  });

  it('rejects an unencrypted remote database in production', () => {
    const { errors } = checkEnv({ ...prodBase, DB_SSL_MODE: 'disable' });
    expect(errors.some((e) => e.includes('must use TLS'))).toBe(true);
    expect(
      checkEnv({
        ...prodBase,
        DB: JSON.stringify({ host: 'localhost' }),
        DB_SSL_MODE: 'disable',
      }).errors,
    ).toEqual([]);
  });

  it('rejects bad enum values and a missing CA file', () => {
    const { errors } = checkEnv({
      ...prodBase,
      ACTIVATE_EDITION: 'onprem',
      ACTIVATE_ROLE: 'batch',
      DB_SSL_MODE: 'yes',
      DB_SSL_CA_FILE: '/nonexistent/ca.pem',
      AUTH_PROVIDER: 'saml',
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ACTIVATE_EDITION'),
        expect.stringContaining('ACTIVATE_ROLE'),
        expect.stringContaining('DB_SSL_MODE'),
        expect.stringContaining('DB_SSL_CA_FILE'),
        expect.stringContaining('AUTH_PROVIDER'),
      ]),
    );
  });

  it('only warns outside production', () => {
    const { errors, warnings } = checkEnv({ DB_SSL: 'true' });
    expect(errors).toEqual([]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ACTIVATE_SECRETS_KEY not set'),
        expect.stringContaining('DB_SSL is deprecated'),
      ]),
    );
  });

  it('marketplace: production self-hosted needs a remote, cloud only warns, aliases still work', () => {
    const selfHosted = { ...prodBase, ACTIVATE_EDITION: 'self-hosted' };
    expect(
      checkEnv(selfHosted).errors.some((e) => e.includes('no remote')),
    ).toBe(true);
    expect(
      checkEnv({ ...selfHosted, LIBRARY_ALLOW_LOCAL: 'true' }).errors,
    ).toEqual([]);
    expect(checkEnv(prodBase).errors).toEqual([]);
    expect(
      checkEnv(prodBase).warnings.some((w) => w.includes('no remote')),
    ).toBe(true);
    const github = {
      ...selfHosted,
      LIBRARY_PROVIDER: 'github',
      LIBRARY_REPOSITORY: 'acme/claude-marketplace',
      LIBRARY_GIT_TOKEN: 't',
    };
    expect(checkEnv(github).errors).toEqual([]);
    expect(
      checkEnv({ ...github, LIBRARY_REPOSITORY: 'not-a-repo' }).errors.some(
        (e) => e.includes('owner/name'),
      ),
    ).toBe(true);
    expect(
      checkEnv({
        ...selfHosted,
        LIBRARY_PROVIDER: 'github',
        LIBRARY_REPOSITORY: 'a/b',
      }).errors.some((e) => e.includes('LIBRARY_GIT_TOKEN')),
    ).toBe(true);
    expect(
      checkEnv({ ...selfHosted, LIBRARY_PROVIDER: 'git' }).errors.some((e) =>
        e.includes('LIBRARY_REMOTE_URL'),
      ),
    ).toBe(true);
    const legacy = checkEnv({
      ...selfHosted,
      GITHUB_REPO: 'a/b',
      GITHUB_TOKEN: 't',
    });
    expect(legacy.errors).toEqual([]);
    expect(legacy.warnings.some((w) => w.includes('deprecated'))).toBe(true);
    expect(
      checkEnv({ ...prodBase, LIBRARY_PROVIDER: 'svn' }).errors.some((e) =>
        e.includes('LIBRARY_PROVIDER'),
      ),
    ).toBe(true);
  });

  it('warns a self-hosted install that grants vendor leads', () => {
    const { warnings } = checkEnv({
      ACTIVATE_EDITION: 'self-hosted',
      LEAD_EMAIL_DOMAINS: 'lightci.com',
    });
    expect(warnings.some((w) => w.includes('cross-organisation'))).toBe(true);
  });
});
