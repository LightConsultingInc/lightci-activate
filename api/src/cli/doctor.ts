import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { UpstreamOidcService } from '../auth/identity/upstream-oidc.service';
import { WorkosService } from '../auth/workos.service';
import { ClaudeEnterpriseService } from '../claude-enterprise/claude-enterprise.service';
import { authProvider, edition, processRole } from '../config/env';
import { PgBossJobs } from '../jobs/jobs.service';
import { LicenseService } from '../license/license.service';
import { Org } from '../orgs/entities/org.entity';
import { IntegrationsService } from '../orgs/integrations.service';
import { GitRepoService } from '../skills/git-repo.service';

export type CheckLevel = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  level: CheckLevel;
  detail: string;
}

const SYMBOL: Record<CheckLevel, string> = { ok: '✓', warn: '!', fail: '✗' };

export function formatChecks(checks: Check[]): string {
  const width = Math.max(...checks.map((c) => c.name.length));
  return checks
    .map((c) => `${SYMBOL[c.level]} ${c.name.padEnd(width)}  ${c.detail}`)
    .join('\n');
}

export function worst(checks: Check[]): CheckLevel {
  if (checks.some((c) => c.level === 'fail')) return 'fail';
  if (checks.some((c) => c.level === 'warn')) return 'warn';
  return 'ok';
}

/**
 * Preflight every dependency an operator cares about, with the same words the self-host
 * guide shows. Each check is independent; one failure never hides another.
 */
export async function runDoctor(
  app: INestApplicationContext,
): Promise<Check[]> {
  const checks: Check[] = [];
  const ds = app.get(DataSource);

  // database and schema
  try {
    const versionRows: { version: string }[] =
      await ds.query('SELECT version()');
    const version = versionRows[0]?.version ?? 'PostgreSQL ?';
    const pending = await ds.showMigrations();
    const migrationRows: { name: string }[] = await ds.query(
      'SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1',
    );
    const name = migrationRows[0]?.name ?? 'none';
    const sslRow = (await ds
      .query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')
      .catch(() => [])) as { ssl?: boolean }[];
    const tls = sslRow[0]?.ssl ? 'TLS on' : 'no TLS';
    checks.push({
      name: 'database',
      level: pending ? 'fail' : 'ok',
      detail: `${version.split(',')[0].replace('PostgreSQL ', 'PostgreSQL ')}, ${tls}, schema at ${name}${pending ? ' (migrations pending: run `activate migrate`)' : ''}`,
    });
  } catch (e) {
    checks.push({
      name: 'database',
      level: 'fail',
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // license
  try {
    const license = app.get(LicenseService);
    const s = await license.state(true);
    if (s.status === 'n/a')
      checks.push({
        name: 'license',
        level: 'ok',
        detail: 'not required (cloud edition)',
      });
    else
      checks.push({
        name: 'license',
        level:
          s.status === 'valid'
            ? 'ok'
            : s.status === 'expiring' || s.status === 'grace'
              ? 'warn'
              : 'fail',
        detail:
          s.status === 'missing' || s.status === 'invalid'
            ? (s.error ?? s.status)
            : `${s.org} · ${s.seatsUsed}/${s.seats} seats · expires ${s.expiresAt?.slice(0, 10)}${s.status !== 'valid' ? ` (${s.status})` : ''}`,
      });
  } catch (e) {
    checks.push({
      name: 'license',
      level: 'fail',
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // identity
  if (authProvider() === 'oidc') {
    const upstream = app.get(UpstreamOidcService);
    const probe = await upstream.probe();
    checks.push({
      name: 'identity',
      level: probe.ok ? 'ok' : 'fail',
      detail: probe.detail,
    });
  } else {
    const workos = app.get(WorkosService);
    if (!workos.enabled)
      checks.push({
        name: 'identity',
        level: 'fail',
        detail: 'WorkOS is not configured (WORKOS_API_KEY / WORKOS_CLIENT_ID)',
      });
    else {
      try {
        const res = await fetch(
          `https://api.workos.com/sso/jwks/${workos.clientId}`,
          { signal: AbortSignal.timeout(5000) },
        );
        checks.push({
          name: 'identity',
          level: res.ok ? 'ok' : 'fail',
          detail: res.ok
            ? `WorkOS client ${workos.clientId}, JWKS reachable`
            : `WorkOS JWKS returned ${res.status}`,
        });
      } catch (e) {
        checks.push({
          name: 'identity',
          level: 'fail',
          detail: `WorkOS unreachable: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  // model provider
  try {
    const integrations = app.get(IntegrationsService);
    const ai = app.get(AiService);
    const key = await integrations.resolve(null, 'anthropic');
    if (ai.provider === 'mock')
      checks.push({
        name: 'anthropic',
        level: 'warn',
        detail: 'AI_PROVIDER=mock: no model calls are made',
      });
    else if (!key)
      checks.push({
        name: 'anthropic',
        level: 'warn',
        detail:
          'no platform Anthropic key; organisations must supply their own under Settings › Integrations',
      });
    else {
      const v = await ai.verifyKey(key.secret);
      checks.push({
        name: 'anthropic',
        level: v.ok ? 'ok' : 'fail',
        detail: v.ok
          ? `api.anthropic.com reachable, key valid, ${ai.defaultModel} configured`
          : v.detail,
      });
    }
  } catch (e) {
    checks.push({
      name: 'anthropic',
      level: 'fail',
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Claude Enterprise keys (per org; platform keys when allowed)
  try {
    const claude = app.get(ClaudeEnterpriseService);
    const integrations = app.get(IntegrationsService);
    const orgs = await ds
      .getRepository(Org)
      .find({ where: { isDemo: false }, take: 50 });
    const scopeOf = async (orgId: string) => ({
      analytics: (await integrations.resolve(orgId, 'claude_analytics'))
        ?.secret,
      admin: (await integrations.resolve(orgId, 'claude_admin'))?.secret,
      compliance: (await integrations.resolve(orgId, 'claude_compliance'))
        ?.secret,
    });
    if (orgs.length === 0)
      checks.push({
        name: 'claude-ent',
        level: 'warn',
        detail:
          'no organisation yet; keys are entered under Settings › Integrations',
      });
    for (const org of orgs) {
      const keys = await scopeOf(org.id);
      if (!keys.analytics && !keys.admin && !keys.compliance) {
        checks.push({
          name: 'claude-ent',
          level: 'warn',
          detail: `${org.slug}: no Claude Enterprise keys yet (adoption charts use Activate's own activity data)`,
        });
        continue;
      }
      const probe = await claude.probe(keys);
      const apis = ['analytics', 'admin', 'compliance'] as const;
      const parts = apis
        .filter((api) => probe[api] !== 'unconfigured')
        .map((api) => {
          const d = probe.details[api];
          const scopes = d?.scopes?.length ? ` (${d.scopes.join(', ')})` : '';
          return `${api} ${probe[api]}${scopes}`;
        });
      checks.push({
        name: 'claude-ent',
        level: apis.some(
          (api) => probe[api] === 'unauthorized' || probe[api] === 'error',
        )
          ? 'warn'
          : 'ok',
        detail: `${org.slug}: ${parts.join(', ')}`,
      });
    }
  } catch (e) {
    checks.push({
      name: 'claude-ent',
      level: 'warn',
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // marketplace
  try {
    const git = app.get(GitRepoService);
    const orgs = await ds.getRepository(Org).find({ take: 50 });
    const targets = orgs.length
      ? orgs
      : [
          {
            id: '00000000-0000-4000-8000-000000000000',
            slug: '(instance)',
          } as Org,
        ];
    for (const org of targets) {
      const ok = await git.refresh(org.id);
      const repo = await git.repoFor(org.id);
      const head = ok ? await git.head(org.id) : null;
      checks.push({
        name: 'marketplace',
        level: ok
          ? repo.config.provider === 'local' && edition() === 'self-hosted'
            ? 'warn'
            : 'ok'
          : 'fail',
        detail: ok
          ? `${org.slug}: ${repo.config.provider} ${repo.label}${head?.head ? ` at ${head.branch}@${head.head.slice(0, 7)}` : ''}${repo.config.provider === 'local' ? ' (local folder: not shared between replicas)' : ''}`
          : `${org.slug}: ${repo.lastError ?? 'unavailable'}`,
      });
    }
  } catch (e) {
    checks.push({
      name: 'marketplace',
      level: 'fail',
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // jobs
  try {
    const jobs = app.get(PgBossJobs);
    const stats = await jobs.stats();
    const nightly = stats.filter((s) => s.name.startsWith('nightly.'));
    const stale = nightly.filter(
      (s) =>
        !s.lastCompletedAt ||
        Date.now() - new Date(s.lastCompletedAt).getTime() >
          26 * 60 * 60 * 1000,
    );
    checks.push({
      name: 'jobs',
      level:
        stale.length === nightly.length && nightly.length > 0 ? 'warn' : 'ok',
      detail: `${stats.length} queues, ${stats.reduce((n, s) => n + s.queued, 0)} queued; role=${processRole()}${stale.length ? `; not run in 26h: ${stale.map((s) => s.name).join(', ')}` : ''}`,
    });
  } catch (e) {
    checks.push({
      name: 'jobs',
      level: 'warn',
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // voice
  checks.push({
    name: 'voice',
    level: 'ok',
    detail: process.env.OPENAI_API_KEY
      ? `enabled (${process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime'})`
      : 'disabled (no OPENAI_API_KEY)',
  });

  return checks;
}
