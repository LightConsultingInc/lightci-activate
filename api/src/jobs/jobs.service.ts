import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import PgBoss from 'pg-boss';
import type { DataSource } from 'typeorm';
import { withAdvisoryLock } from '../common/pg-lock';
import { processRole } from '../config/env';
import {
  JobRegistry,
  type EnqueueOptions,
  type JobDefinition,
  type JobsPort,
} from './jobs.port';

export const JOBS_SCHEMA = process.env.JOBS_SCHEMA ?? 'pgboss';

/**
 * Postgres-backed queue shared by every process. The api role only enqueues; the
 * worker role (or `all`) runs handlers and owns the schedules. pg-boss elects one
 * scheduler across processes, so a nightly job fires once however many workers run,
 * and singleton keys stop the same work being queued twice.
 */
@Injectable()
export class PgBossJobs
  implements JobsPort, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PgBossJobs.name);
  private boss: PgBoss | null = null;
  private readonly role = processRole();

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly registry: JobRegistry,
  ) {}

  get runsHandlers(): boolean {
    return this.role !== 'api';
  }

  async onApplicationBootstrap(): Promise<void> {
    const o = this.ds.options as {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      database?: string;
      ssl?: unknown;
    };
    this.boss = new PgBoss({
      host: o.host,
      port: o.port,
      user: o.username,
      password: o.password,
      database: o.database,
      ssl: o.ssl === false ? undefined : o.ssl,
      schema: JOBS_SCHEMA,
      max: 4,
      application_name: `activate-${this.role}`,
      // Only workers supervise the queue tables and run the clock for schedules.
      supervise: this.runsHandlers,
      schedule: this.runsHandlers,
      // Keep finished jobs a week so an operator can inspect what ran.
      deleteAfterDays: 7,
    });
    this.boss.on('error', (e) =>
      this.logger.error(`queue error: ${e instanceof Error ? e.message : e}`),
    );
    await this.boss.start();
    // Creating queues from several processes at once (api and worker on first boot) deadlocks in
    // pg-boss's queue table; one process installs at a time, the others wait their turn.
    await withAdvisoryLock(this.ds, 'activate.jobs.install', async () => {
      for (const def of this.registry.all()) await this.installQueue(def);
    });
    if (this.runsHandlers)
      for (const def of this.registry.all())
        if (def.onBoot)
          await this.enqueue(
            def.name,
            {},
            { singletonKey: def.onBoot.singletonKey },
          );
    this.logger.log(
      `Job queue ready (${this.registry.all().length} queues, role=${this.role}, handlers=${this.runsHandlers ? 'on' : 'off'})`,
    );
  }

  private async installQueue(def: JobDefinition): Promise<void> {
    const boss = this.boss!;
    // 'stately': one job per singleton key across created, retry and active, so a second
    // enqueue while the first is still running is a no-op (what module.prepare relies on).
    // Standard queues run unrelated jobs side by side.
    await boss.createQueue(def.name, {
      name: def.name,
      policy: def.singleton || def.cron ? 'stately' : 'standard',
      retryLimit: def.retryLimit ?? 3,
      retryDelay: def.retryDelaySeconds ?? 30,
      retryBackoff: true,
      expireInSeconds: def.expireInSeconds ?? 15 * 60,
    });
    if (!this.runsHandlers) return;
    await boss.work(
      def.name,
      { batchSize: 1, pollingIntervalSeconds: 2 },
      async (jobs: PgBoss.Job<unknown>[]) => {
        for (const job of jobs) {
          const started = Date.now();
          try {
            await def.handler(job.data);
            this.logger.log(
              `job ${def.name} ${job.id} done in ${Date.now() - started}ms`,
            );
          } catch (e) {
            this.logger.warn(
              `job ${def.name} ${job.id} failed: ${e instanceof Error ? e.message : String(e)}`,
            );
            throw e;
          }
        }
      },
    );
    if (def.cron) {
      await boss.schedule(
        def.name,
        def.cron,
        {},
        { tz: process.env.WORKER_TIMEZONE ?? 'UTC', singletonKey: 'schedule' },
      );
    }
  }

  async enqueue<T extends object>(
    name: string,
    data: T,
    opts: EnqueueOptions = {},
  ): Promise<string | null> {
    if (!this.boss) throw new Error('Job queue is not started');
    return this.boss.send(name, data, {
      ...(opts.singletonKey ? { singletonKey: opts.singletonKey } : {}),
      ...(opts.retryLimit !== undefined ? { retryLimit: opts.retryLimit } : {}),
      ...(opts.retryDelaySeconds !== undefined
        ? { retryDelay: opts.retryDelaySeconds }
        : {}),
      ...(opts.expireInSeconds !== undefined
        ? { expireInSeconds: opts.expireInSeconds }
        : {}),
    });
  }

  async isPending(name: string, singletonKey: string): Promise<boolean> {
    const rows: unknown[] = await this.ds.query(
      `SELECT 1 FROM ${JOBS_SCHEMA}.job WHERE name = $1 AND singleton_key = $2 AND state IN ('created','retry','active') LIMIT 1`,
      [name, singletonKey],
    );
    return rows.length > 0;
  }

  async whenIdle(name: string, singletonKey: string): Promise<void> {
    for (let i = 0; i < 600; i++) {
      if (!(await this.isPending(name, singletonKey))) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${name}:${singletonKey} still pending after 60s`);
  }

  /** Queue depth and the last successful completion per queue, for /metrics and doctor. */
  async stats(): Promise<
    { name: string; queued: number; lastCompletedAt: string | null }[]
  > {
    type Row = { name: string; queued: number; last_completed: Date | null };
    const rows: Row[] = await this.ds.query(
      `SELECT name,
              COUNT(*) FILTER (WHERE state IN ('created','retry','active'))::int AS queued,
              MAX(completed_on) FILTER (WHERE state = 'completed') AS last_completed
         FROM ${JOBS_SCHEMA}.job GROUP BY name`,
    );
    const byName = new Map(rows.map((r) => [r.name, r]));
    // Every registered queue appears, idle ones at 0: a missing series is worse than a zero for an
    // operator's dashboard, and doctor can tell "never ran" from "no such queue".
    const names = new Set<string>([
      ...this.registry.all().map((d) => d.name),
      ...byName.keys(),
    ]);
    return [...names].sort().map((name) => {
      const r = byName.get(name);
      return {
        name,
        queued: r?.queued ?? 0,
        lastCompletedAt: r?.last_completed
          ? new Date(r.last_completed).toISOString()
          : null,
      };
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.boss) return;
    await this.boss.stop({ graceful: true, timeout: 20_000 });
    this.boss = null;
  }
}
