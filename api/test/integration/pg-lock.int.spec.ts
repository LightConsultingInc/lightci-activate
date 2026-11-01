/** Advisory locks against the local Postgres from api/.env (T2.6). */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import AppDataSource from '../../src/typeorm.config';
import { withAdvisoryLock } from '../../src/common/pg-lock';

describe('withAdvisoryLock', () => {
  const ds = new DataSource({ ...AppDataSource.options, migrationsRun: false });
  beforeAll(() => ds.initialize());
  afterAll(() => ds.destroy());

  it('serialises concurrent holders of the same key and leaves other keys free', async () => {
    const events: string[] = [];
    const hold = (label: string, key: string, ms: number) =>
      withAdvisoryLock(ds, key, async () => {
        events.push(`${label}:start`);
        await new Promise((r) => setTimeout(r, ms));
        events.push(`${label}:end`);
        return label;
      });
    const results = await Promise.all([
      hold('first', 'interview:complete:s1', 400),
      new Promise((r) => setTimeout(r, 50)).then(() =>
        hold('second', 'interview:complete:s1', 50),
      ),
      new Promise((r) => setTimeout(r, 50)).then(() =>
        hold('other', 'interview:complete:s2', 50),
      ),
    ]);
    expect(results).toEqual(['first', 'second', 'other']);
    // The same key waits for the first holder; a different key does not.
    expect(events.indexOf('second:start')).toBeGreaterThan(
      events.indexOf('first:end'),
    );
    expect(events.indexOf('other:end')).toBeLessThan(
      events.indexOf('first:end'),
    );
  }, 20_000);

  it('releases the lock when the callback throws', async () => {
    await expect(
      withAdvisoryLock(ds, 'k', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    const again = await withAdvisoryLock(ds, 'k', () => Promise.resolve('ok'));
    expect(again).toBe('ok');
  });
});
