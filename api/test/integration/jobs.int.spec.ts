/**
 * The real queue against the local Postgres from api/.env (T2.2). Two PgBossJobs
 * instances stand in for two worker processes sharing one database.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import AppDataSource from '../../src/typeorm.config';
import { JobRegistry } from '../../src/jobs/jobs.port';
import { PgBossJobs } from '../../src/jobs/jobs.service';

const QUEUE = `it.echo.${process.pid}`;
const SINGLE = `it.single.${process.pid}`;

async function boot(
  registry: JobRegistry,
  ds: DataSource,
): Promise<PgBossJobs> {
  const jobs = new PgBossJobs(ds, registry);
  await jobs.onApplicationBootstrap();
  return jobs;
}

describe('PgBossJobs on Postgres', () => {
  const ds = new DataSource({ ...AppDataSource.options, migrationsRun: false });
  const runs: { by: string; data: unknown }[] = [];
  let a: PgBossJobs;
  let b: PgBossJobs;

  beforeAll(async () => {
    await ds.initialize();
    const define = (registry: JobRegistry, by: string) => {
      for (const [name, singleton] of [
        [QUEUE, false],
        [SINGLE, true],
      ] as const) {
        registry.register<{ n: number }>({
          name,
          singleton,
          retryLimit: 0,
          handler: async (data) => {
            runs.push({ by, data });
            await new Promise((r) => setTimeout(r, 300));
          },
        });
      }
    };
    const registryA = new JobRegistry();
    define(registryA, 'a');
    const registryB = new JobRegistry();
    define(registryB, 'b');
    a = await boot(registryA, ds);
    b = await boot(registryB, ds);
  }, 60_000);

  afterAll(async () => {
    await a?.onApplicationShutdown();
    await b?.onApplicationShutdown();
    for (const name of [QUEUE, SINGLE]) {
      await ds
        .query(`DELETE FROM pgboss.job WHERE name = $1`, [name])
        .catch(() => undefined);
      await ds
        .query(`DELETE FROM pgboss.queue WHERE name = $1`, [name])
        .catch(() => undefined);
    }
    await ds.destroy();
  });

  it('runs each job exactly once across two workers', async () => {
    const ids = await Promise.all(
      [1, 2, 3, 4].map((n) => a.enqueue(QUEUE, { n })),
    );
    expect(ids.every(Boolean)).toBe(true);
    for (let i = 0; i < 100 && runs.length < 4; i++)
      await new Promise((r) => setTimeout(r, 100));
    expect(runs.map((r) => (r.data as { n: number }).n).sort()).toEqual([
      1, 2, 3, 4,
    ]);
    expect(runs).toHaveLength(4);
  }, 30_000);

  it('dedupes by singleton key while pending and reports pending state from any instance', async () => {
    runs.length = 0;
    const first = await a.enqueue(
      SINGLE,
      { n: 10 },
      { singletonKey: 'person:module' },
    );
    const second = await b.enqueue(
      SINGLE,
      { n: 11 },
      { singletonKey: 'person:module' },
    );
    expect(first).toBeTruthy();
    expect(second).toBeNull();
    expect(await b.isPending(SINGLE, 'person:module')).toBe(true);
    await b.whenIdle(SINGLE, 'person:module');
    expect(await a.isPending(SINGLE, 'person:module')).toBe(false);
    expect(runs.map((r) => (r.data as { n: number }).n)).toEqual([10]);
    // Once finished, the same key may run again.
    const third = await a.enqueue(
      SINGLE,
      { n: 12 },
      { singletonKey: 'person:module' },
    );
    expect(third).toBeTruthy();
    await a.whenIdle(SINGLE, 'person:module');
    expect(runs).toHaveLength(2);
  }, 30_000);

  it('exposes queue stats', async () => {
    const stats = await a.stats();
    const mine = stats.find((s) => s.name === SINGLE);
    expect(mine).toBeDefined();
    expect(mine?.queued).toBe(0);
    expect(mine?.lastCompletedAt).toBeTruthy();
  });
});
