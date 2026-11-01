import type { INestApplicationContext } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DataSource } from 'typeorm';
import { PgBossJobs } from '../jobs/jobs.service';
import { formatChecks, runDoctor } from './doctor';

const SECRET_PATTERN = /(KEY|SECRET|TOKEN|PASSWORD|LICENSE|^DB$)/i;

/** Environment with every secret-looking value replaced by its length; addresses hashed. */
export function redactedEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (
      !/^(ACTIVATE_|AUTH_|DB_|DB$|LIBRARY_|WORKOS_|ANTHROPIC_|CLAUDE_|OPENAI_|PUBLIC_|WEB_URL|CORS_|NODE_ENV|PORT|LOG_LEVEL|WORKER_|JOBS_|MIGRATIONS_|SEED_|AI_PROVIDER|LEAD_)/.test(
        k,
      )
    )
      continue;
    out[k] = SECRET_PATTERN.test(k) ? `<set, ${v.length} chars>` : v;
  }
  return out;
}

function packageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function hashEmail(email: string): string {
  return `sha256:${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)}`;
}

/**
 * A tarball LightCI support can work from, with nothing in it that belongs to the customer's
 * people: versions, redacted configuration, doctor output, schema version, queue state and job
 * history, counts per table. Never prompts, practice work, interview text, keys or addresses.
 */
export async function writeSupportBundle(
  app: INestApplicationContext,
  outPath: string,
): Promise<string[]> {
  const ds = app.get(DataSource);
  const dir = mkdtempSync(join(tmpdir(), 'activate-support-'));
  const files: string[] = [];
  const put = (name: string, content: string) => {
    writeFileSync(join(dir, name), content);
    files.push(name);
  };

  put(
    'versions.json',
    JSON.stringify(
      {
        activate: packageVersion(),
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  put('config.redacted.json', JSON.stringify(redactedEnv(), null, 2));
  put('doctor.txt', formatChecks(await runDoctor(app)));

  const migrations: { name: string; timestamp: string }[] = await ds.query(
    'SELECT name, timestamp FROM migrations ORDER BY timestamp DESC LIMIT 20',
  );
  put(
    'schema.json',
    JSON.stringify(
      { pending: await ds.showMigrations(), recent: migrations },
      null,
      2,
    ),
  );

  try {
    const jobs = app.get(PgBossJobs);
    const history: Record<string, unknown>[] = await ds.query(
      `SELECT name, state, count(*)::int AS count, max(completed_on) AS last_completed, max(created_on) AS last_created
         FROM pgboss.job GROUP BY name, state ORDER BY name, state`,
    );
    put(
      'jobs.json',
      JSON.stringify({ stats: await jobs.stats(), history }, null, 2),
    );
  } catch (e) {
    put(
      'jobs.json',
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
    );
  }

  const counts: Record<string, number> = {};
  for (const meta of ds.entityMetadatas) {
    const count: Promise<{ n: number }[]> = ds.query(
      `SELECT count(*)::int AS n FROM "${meta.tableName}"`,
    );
    const rows = await count.catch((): { n: number }[] => [{ n: -1 }]);
    counts[meta.tableName] = rows[0]?.n ?? -1;
  }
  put('table-counts.json', JSON.stringify(counts, null, 2));

  const orgs: Record<string, unknown>[] = await ds.query(
    'SELECT slug, "residencyMode", "emailDomains", "isDemo", seats, "createdAt" FROM orgs ORDER BY "createdAt"',
  );
  put('orgs.json', JSON.stringify(orgs, null, 2));

  execFileSync('tar', ['-czf', outPath, '-C', dir, ...files]);
  rmSync(dir, { recursive: true, force: true });
  return files;
}
