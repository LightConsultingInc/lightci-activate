#!/usr/bin/env node
/**
 * `activate` operator CLI. Shipped in the server image as /usr/local/bin/activate.
 *
 *   activate migrate [--check]      apply pending migrations (safe to run from several places at once)
 *   activate doctor                 preflight: database, license, identity, model provider, Claude keys, marketplace, jobs
 *   activate bootstrap              first-boot provisioning from ACTIVATE_ORG_* (idempotent)
 *   activate support-bundle [path]  write a redacted diagnostics tarball (default ./activate-support.tgz)
 *   activate secrets rotate         re-encrypt stored credentials from ACTIVATE_SECRETS_KEY_PREVIOUS to the current key
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import {
  BootstrapService,
  bootstrapConfig,
} from './bootstrap/bootstrap.service';
import { parseArgs } from './cli/args';
import { formatChecks, runDoctor, worst } from './cli/doctor';
import { rotateSecrets } from './cli/rotate';
import { writeSupportBundle } from './cli/support-bundle';
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

/**
 * Boot the application without HTTP and without background work, so a command sees exactly
 * what the running service sees (same configuration, same providers).
 */
async function withApp<T>(
  fn: (app: INestApplicationContext) => Promise<T>,
): Promise<T> {
  process.env.ACTIVATE_ROLE = 'api';
  process.env.MIGRATIONS_RUN_ON_BOOT =
    process.env.MIGRATIONS_RUN_ON_BOOT ?? 'false';
  process.env.SEED_ON_BOOT = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}

const HELP = `activate <command>

  migrate [--check]       apply pending database migrations (or report whether any are pending)
  doctor                  check database, license, identity, model provider, Claude keys, marketplace and jobs
  bootstrap               create the organisation and admins from ACTIVATE_ORG_* (idempotent)
  support-bundle [path]   write a redacted diagnostics tarball for LightCI support
  secrets rotate          re-encrypt stored credentials with the current ACTIVATE_SECRETS_KEY
  help                    show this message`;

async function main(argv: string[]): Promise<number> {
  const { command, flags, rest } = parseArgs(argv);
  switch (command) {
    case 'migrate':
      return migrate({ check: flags.has('--check') });
    case 'doctor': {
      return withApp(async (app) => {
        const checks = await runDoctor(app);
        out(formatChecks(checks));
        return worst(checks) === 'fail' ? 1 : 0;
      });
    }
    case 'bootstrap': {
      return withApp(async (app) => {
        const config = bootstrapConfig();
        const result = await app.get(BootstrapService).run(config);
        out(
          `catalogue: ${result.catalogue.inserted} inserted, ${result.catalogue.updated} updated`,
        );
        if (!result.org) {
          out('organisation: ACTIVATE_ORG_SLUG not set; nothing to create');
          return 0;
        }
        out(
          `organisation: ${result.org.slug} ${result.org.created ? 'created' : 'already present'}`,
        );
        out(
          `admins: ${result.admins.created.length} created, ${result.admins.existing.length} already present`,
        );
        return 0;
      });
    }
    case 'support-bundle': {
      const target = rest[0] ?? 'activate-support.tgz';
      return withApp(async (app) => {
        const files = await writeSupportBundle(app, target);
        out(`wrote ${target} (${files.join(', ')})`);
        return 0;
      });
    }
    case 'secrets': {
      if (rest[0] !== 'rotate') {
        process.stderr.write(
          `Unknown secrets command "${rest[0] ?? ''}". Try: activate secrets rotate\n`,
        );
        return 2;
      }
      return withApp(async (app) => {
        const r = await rotateSecrets(app);
        out(
          `integrations: ${r.integrations.rotated} re-encrypted, ${r.integrations.failed} failed, ${r.integrations.total - r.integrations.rotated - r.integrations.failed} already current`,
        );
        out(
          `signing keys: ${r.signingKeys.rotated} re-encrypted, ${r.signingKeys.failed} failed, ${r.signingKeys.total - r.signingKeys.rotated - r.signingKeys.failed} already current`,
        );
        const remaining = r.integrations.failed + r.signingKeys.failed;
        out(
          remaining === 0
            ? 'zero remaining: ACTIVATE_SECRETS_KEY_PREVIOUS can be removed'
            : `${remaining} could not be decrypted with any configured key`,
        );
        return remaining === 0 ? 0 : 1;
      });
    }
    case 'help':
    case '--help':
    case '-h':
      out(HELP);
      return 0;
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
