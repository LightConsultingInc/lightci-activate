import { existsSync } from 'node:fs';

/**
 * Startup configuration: what edition and role this process runs as, and the
 * checks that must pass before Nest boots. Everything here reads a plain env
 * object so it can be unit-tested without touching process.env.
 *
 * Editions:
 *   cloud        LightCI-operated cells (default, keeps today's behaviour).
 *   self-hosted  A customer's own install. Stricter defaults, no vendor assumptions.
 * Roles:
 *   api          HTTP only (REST, MCP, OAuth metadata).
 *   worker       Schedules, jobs, git publishing. No HTTP listener.
 *   all          Both in one process (local development, Compose evaluation).
 */
export type Edition = 'cloud' | 'self-hosted';
export type ProcessRole = 'api' | 'worker' | 'all';
export type DbSslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

export const DB_SSL_MODES: DbSslMode[] = [
  'disable',
  'require',
  'verify-ca',
  'verify-full',
];

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

type Env = Record<string, string | undefined>;

const truthy = (v: string | undefined) => v === 'true' || v === '1';

export function isProduction(env: Env = process.env): boolean {
  return env.NODE_ENV === 'production';
}

export function edition(env: Env = process.env): Edition {
  return env.ACTIVATE_EDITION === 'self-hosted' ? 'self-hosted' : 'cloud';
}

export function processRole(env: Env = process.env): ProcessRole {
  const r = env.ACTIVATE_ROLE;
  return r === 'api' || r === 'worker' ? r : 'all';
}

/** Lead (vendor) email domains. Cloud defaults to lightci.com; self-hosted installs have no vendor leads unless they say so. */
export function leadEmailDomains(env: Env = process.env): string[] {
  const raw =
    env.LEAD_EMAIL_DOMAINS ?? (edition(env) === 'cloud' ? 'lightci.com' : '');
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** Demo seed routes and SEED_ON_BOOT are only wired in when this is true. */
export function seedEnabled(env: Env = process.env): boolean {
  if (truthy(env.ACTIVATE_ALLOW_SEED)) return true;
  return edition(env) === 'cloud' && !isProduction(env);
}

/** Auto-run migrations on boot. Production defaults to off: run `activate migrate` as a step instead. */
export function migrationsRunOnBoot(env: Env = process.env): boolean {
  if (env.MIGRATIONS_RUN_ON_BOOT !== undefined)
    return truthy(env.MIGRATIONS_RUN_ON_BOOT);
  return !isProduction(env);
}

/** Resolve the DB TLS mode, honouring the deprecated DB_SSL=true|false alias. */
export function dbSslMode(env: Env = process.env, host?: string): DbSslMode {
  const mode = env.DB_SSL_MODE;
  if (mode && (DB_SSL_MODES as string[]).includes(mode))
    return mode as DbSslMode;
  if (env.DB_SSL !== undefined)
    return truthy(env.DB_SSL) ? 'require' : 'disable';
  const isLocal =
    host === undefined || host === 'localhost' || host === '127.0.0.1';
  return isLocal ? 'disable' : 'verify-full';
}

/** Instance-level marketplace provider, mirroring skills/git-repo.service.ts (kept here to avoid an import cycle). */
export function marketplaceProvider(env: Env): 'local' | 'github' | 'git' {
  const explicit = env.LIBRARY_PROVIDER;
  if (explicit === 'local' || explicit === 'github' || explicit === 'git')
    return explicit;
  if (env.LIBRARY_REMOTE_URL) return 'git';
  if (
    (env.LIBRARY_REPOSITORY ?? env.GITHUB_REPO) &&
    (env.LIBRARY_GIT_TOKEN ?? env.GITHUB_TOKEN)
  )
    return 'github';
  return 'local';
}

function dbHost(env: Env): string | undefined {
  if (env.DB) {
    try {
      const parsed = JSON.parse(env.DB) as { host?: string };
      return parsed.host;
    } catch {
      return undefined;
    }
  }
  return env.DB_HOST;
}

/**
 * Validate the environment for this process. Returns every problem at once so an
 * operator fixes them in one pass. `errors` stop the boot; `warnings` are logged.
 */
export function checkEnv(env: Env = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prod = isProduction(env);
  const ed = edition(env);
  const role = processRole(env);

  if (
    env.ACTIVATE_EDITION &&
    !['cloud', 'self-hosted'].includes(env.ACTIVATE_EDITION)
  )
    errors.push(
      `ACTIVATE_EDITION must be "cloud" or "self-hosted" (got "${env.ACTIVATE_EDITION}").`,
    );
  if (
    env.ACTIVATE_ROLE &&
    !['api', 'worker', 'all'].includes(env.ACTIVATE_ROLE)
  )
    errors.push(
      `ACTIVATE_ROLE must be "api", "worker" or "all" (got "${env.ACTIVATE_ROLE}").`,
    );

  // Secrets at rest.
  if (!env.ACTIVATE_SECRETS_KEY) {
    if (prod)
      errors.push(
        'ACTIVATE_SECRETS_KEY is required: stored credentials are encrypted with it.',
      );
    else
      warnings.push(
        'ACTIVATE_SECRETS_KEY not set; using a development-only key.',
      );
  }

  // Database.
  if (env.DB) {
    try {
      JSON.parse(env.DB);
    } catch {
      errors.push(
        'DB is set but is not valid JSON ({host, port, username, password, dbname}).',
      );
    }
  } else if (prod) {
    if (!env.DB_HOST)
      errors.push('DB_HOST (or the DB JSON secret) is required.');
    if (!env.DB_PASSWORD)
      errors.push('DB_PASSWORD (or the DB JSON secret) is required.');
  }
  if (env.DB_SSL_MODE && !(DB_SSL_MODES as string[]).includes(env.DB_SSL_MODE))
    errors.push(
      `DB_SSL_MODE must be one of ${DB_SSL_MODES.join(', ')} (got "${env.DB_SSL_MODE}").`,
    );
  if (env.DB_SSL !== undefined && env.DB_SSL_MODE === undefined)
    warnings.push(
      'DB_SSL is deprecated; use DB_SSL_MODE=require|disable instead.',
    );
  const mode = dbSslMode(env, dbHost(env));
  if (env.DB_SSL_CA_FILE && !existsSync(env.DB_SSL_CA_FILE))
    errors.push(
      `DB_SSL_CA_FILE points to a file that does not exist: ${env.DB_SSL_CA_FILE}`,
    );
  if (
    prod &&
    mode === 'disable' &&
    !['localhost', '127.0.0.1'].includes(dbHost(env) ?? '')
  )
    errors.push(
      'The database must use TLS in production (DB_SSL_MODE=disable is only allowed for a local host).',
    );
  if (prod && mode === 'require')
    warnings.push(
      'DB_SSL_MODE=require encrypts the connection but does not verify the server. Prefer verify-full with DB_SSL_CA_FILE.',
    );

  // Public URLs.
  if (prod && role !== 'worker') {
    if (!env.WEB_URL)
      errors.push('WEB_URL is required: the public URL of the web app.');
    if (!env.PUBLIC_API_URL && !env.MCP_PUBLIC_URL)
      errors.push(
        'PUBLIC_API_URL is required: the origin Claude uses for the connector and OAuth metadata.',
      );
  }

  // Identity.
  const provider = env.AUTH_PROVIDER ?? 'workos';
  if (!['workos', 'oidc'].includes(provider))
    errors.push(
      `AUTH_PROVIDER must be "workos" or "oidc" (got "${provider}").`,
    );
  if (provider === 'workos' && prod && role !== 'worker') {
    if (!env.WORKOS_API_KEY)
      errors.push('WORKOS_API_KEY is required when AUTH_PROVIDER=workos.');
    if (!env.WORKOS_CLIENT_ID)
      errors.push('WORKOS_CLIENT_ID is required when AUTH_PROVIDER=workos.');
  }
  if (provider === 'oidc') {
    for (const k of ['AUTH_OIDC_ISSUER', 'AUTH_OIDC_CLIENT_ID'])
      if (!env[k]) errors.push(`${k} is required when AUTH_PROVIDER=oidc.`);
  }

  // Development-only switches must never be on in production.
  if (prod) {
    if (truthy(env.SEED_ON_BOOT) && !seedEnabled(env))
      errors.push(
        'SEED_ON_BOOT=true is refused in production. Set ACTIVATE_ALLOW_SEED=true if this is a demo environment.',
      );
    if (env.MCP_DEV_USER_EMAIL)
      errors.push(
        'MCP_DEV_USER_EMAIL (unauthenticated MCP impersonation) must not be set in production.',
      );
    if (env.AI_PROVIDER === 'mock')
      errors.push('AI_PROVIDER=mock must not be used in production.');
  }
  // Marketplace repository. Production needs a remote: a local folder lives and dies with one container.
  const mp = marketplaceProvider(env);
  if (
    env.LIBRARY_PROVIDER &&
    !['local', 'github', 'git'].includes(env.LIBRARY_PROVIDER)
  )
    errors.push(
      `LIBRARY_PROVIDER must be "local", "github" or "git" (got "${env.LIBRARY_PROVIDER}").`,
    );
  if (
    (env.GITHUB_REPO || env.GITHUB_TOKEN) &&
    !env.LIBRARY_REPOSITORY &&
    !env.LIBRARY_GIT_TOKEN
  )
    warnings.push(
      'GITHUB_REPO / GITHUB_TOKEN are deprecated; use LIBRARY_REPOSITORY and LIBRARY_GIT_TOKEN.',
    );
  if (mp === 'github') {
    const repository = env.LIBRARY_REPOSITORY ?? env.GITHUB_REPO;
    if (!repository || !/^[^/\s]+\/[^/\s]+$/.test(repository))
      errors.push(
        'LIBRARY_REPOSITORY must be owner/name when LIBRARY_PROVIDER=github.',
      );
    if (!(env.LIBRARY_GIT_TOKEN ?? env.GITHUB_TOKEN))
      errors.push(
        'LIBRARY_GIT_TOKEN is required when LIBRARY_PROVIDER=github.',
      );
  }
  if (mp === 'git' && !env.LIBRARY_REMOTE_URL)
    errors.push('LIBRARY_REMOTE_URL is required when LIBRARY_PROVIDER=git.');
  if (prod && mp === 'local' && !truthy(env.LIBRARY_ALLOW_LOCAL)) {
    const msg =
      'The marketplace has no remote (LIBRARY_PROVIDER=local): skills published from one replica are invisible to the others and lost on redeploy. Set LIBRARY_PROVIDER=github with LIBRARY_REPOSITORY and LIBRARY_GIT_TOKEN, or LIBRARY_ALLOW_LOCAL=true for a single-node evaluation.';
    if (ed === 'self-hosted') errors.push(msg);
    else warnings.push(msg);
  }

  if (ed === 'self-hosted' && leadEmailDomains(env).length > 0)
    warnings.push(
      `LEAD_EMAIL_DOMAINS grants cross-organisation access to ${leadEmailDomains(env).join(', ')}.`,
    );
  if (ed === 'self-hosted' && truthy(env.ALLOW_PLATFORM_ENTERPRISE_KEYS))
    warnings.push(
      'ALLOW_PLATFORM_ENTERPRISE_KEYS has no effect in a self-hosted install.',
    );

  return { errors, warnings };
}

/** Run the checks against process.env; print warnings; throw with every error if any. */
export function assertEnv(env: Env = process.env): EnvReport {
  const report = checkEnv(env);
  for (const w of report.warnings) console.warn(`[config] ${w}`);
  if (report.errors.length) {
    const lines = report.errors.map((e) => `  - ${e}`).join('\n');
    throw new Error(
      `Configuration is incomplete. Fix the following and start again:\n${lines}`,
    );
  }
  return report;
}
