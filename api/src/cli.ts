#!/usr/bin/env node
/**
 * `activate` operator CLI. Shipped in the server image as /usr/local/bin/activate.
 *
 *   activate migrate            apply pending migrations (safe to run from several places at once)
 *   activate migrate --check    exit 1 if migrations are pending, 0 if the schema is current
 *
 * `doctor`, `bootstrap`, `support-bundle` and `secrets rotate` arrive with later milestones.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import AppDataSource from './typeorm.config';

const LOCK_KEY = 'activate:migrate';

function out(line: string) {
  process.stdout.write(`${line}\n`);
}

async function withDataSource<T>(
  fn: (ds: DataSource) => Promise<T>,
): Promise<T> {
  const ds = new DataSource({ ...AppDataSource.options, migrationsRun: false });
  await ds.initialize();
  try {
    return await fn(ds);
  } finally {
    await ds.destroy();
  }
}

export async function migrate(opts: { check: boolean }): Promise<number> {
  return withDataSource(async (ds) => {
    if (opts.check) {
      const pending = await ds.showMigrations();
      out(pending ? 'migrations: pending' : 'migrations: current');
      return pending ? 1 : 0;
    }
    // One process applies migrations at a time; the others wait, then find nothing to do.
    const lock = ds.createQueryRunner();
    await lock.connect();
    await lock.query('SELECT pg_advisory_lock(hashtext($1))', [LOCK_KEY]);
    try {
      const applied = await ds.runMigrations({ transaction: 'each' });
      if (applied.length === 0) out('migrations: current (nothing to apply)');
      for (const m of applied) out(`applied ${m.name}`);
      return 0;
    } finally {
      await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]);
      await lock.release();
    }
  });
}

export function parseArgs(argv: string[]): {
  command: string;
  flags: Set<string>;
  rest: string[];
} {
  const [command = 'help', ...others] = argv;
  const flags = new Set(others.filter((a) => a.startsWith('--')));
  const rest = others.filter((a) => !a.startsWith('--'));
  return { command, flags, rest };
}

const HELP = `activate <command>

  migrate [--check]   apply pending database migrations (or report whether any are pending)
  help                show this message

Coming in later releases: doctor, bootstrap, support-bundle, secrets rotate.`;

async function main(argv: string[]): Promise<number> {
  const { command, flags } = parseArgs(argv);
  switch (command) {
    case 'migrate':
      return migrate({ check: flags.has('--check') });
    case 'help':
    case '--help':
    case '-h':
      out(HELP);
      return 0;
    case 'doctor':
    case 'bootstrap':
    case 'support-bundle':
    case 'secrets':
      process.stderr.write(`"${command}" is not available in this release.\n`);
      return 2;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${HELP}\n`);
      return 2;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exitCode = 1;
    },
  );
}
