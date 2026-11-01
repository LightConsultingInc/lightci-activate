import type { DataSource } from 'typeorm';

/**
 * Run `fn` while holding a Postgres session advisory lock on `key`. Processes that
 * contend for the same key wait their turn, so work that must not run twice across
 * replicas (an interview completion, a marketplace write) is serialised database-wide.
 * The lock lives on its own connection so `fn` may use the pool freely.
 */
export async function withAdvisoryLock<T>(
  ds: DataSource,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const runner = ds.createQueryRunner();
  await runner.connect();
  try {
    await runner.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
    try {
      return await fn();
    } finally {
      await runner.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
    }
  } finally {
    await runner.release();
  }
}
