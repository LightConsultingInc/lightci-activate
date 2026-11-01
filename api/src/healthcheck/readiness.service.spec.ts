import { ReadinessService } from './readiness.service';

const ds = (over: {
  query?: () => Promise<unknown>;
  showMigrations?: () => Promise<boolean>;
}) => ({
  query: over.query ?? (() => Promise.resolve([{ '?column?': 1 }])),
  showMigrations: over.showMigrations ?? (() => Promise.resolve(false)),
});

describe('ReadinessService.evaluate (T0.7)', () => {
  it('is ok when the database answers and the schema is current', async () => {
    await expect(ReadinessService.evaluate(ds({}))).resolves.toEqual({
      status: 'ok',
      db: 'ok',
      migrations: 'current',
      license: 'n/a',
    });
  });

  it('fails when the database is unreachable', async () => {
    const report = await ReadinessService.evaluate(
      ds({ query: () => Promise.reject(new Error('ECONNREFUSED')) }),
    );
    expect(report).toMatchObject({
      status: 'fail',
      db: 'fail',
      migrations: 'unknown',
    });
  });

  it('fails while migrations are pending', async () => {
    const report = await ReadinessService.evaluate(
      ds({ showMigrations: () => Promise.resolve(true) }),
    );
    expect(report).toMatchObject({
      status: 'fail',
      db: 'ok',
      migrations: 'pending',
    });
  });

  it('fails when the migration table cannot be read', async () => {
    const report = await ReadinessService.evaluate(
      ds({
        showMigrations: () => Promise.reject(new Error('relation missing')),
      }),
    );
    expect(report).toMatchObject({ status: 'fail', migrations: 'unknown' });
  });
});
