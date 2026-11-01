import { InlineJobs, JobRegistry } from './jobs.port';

describe('InlineJobs', () => {
  it('runs registered handlers, dedupes in-flight singleton keys, and reports pending state', async () => {
    const registry = new JobRegistry();
    const seen: number[] = [];
    registry.register<{ n: number }>({
      name: 'echo',
      handler: async (d) => {
        await new Promise((r) => setTimeout(r, 20));
        seen.push(d.n);
      },
    });
    const jobs = new InlineJobs(registry);
    expect(
      await jobs.enqueue('echo', { n: 1 }, { singletonKey: 'k' }),
    ).toBeTruthy();
    expect(
      await jobs.enqueue('echo', { n: 2 }, { singletonKey: 'k' }),
    ).toBeNull();
    expect(await jobs.isPending('echo', 'k')).toBe(true);
    await jobs.whenIdle('echo', 'k');
    expect(await jobs.isPending('echo', 'k')).toBe(false);
    expect(seen).toEqual([1]);
    expect(
      await jobs.enqueue('echo', { n: 3 }, { singletonKey: 'k' }),
    ).toBeTruthy();
    await jobs.whenIdle('echo', 'k');
    expect(seen).toEqual([1, 3]);
    expect(jobs.enqueued).toEqual(['echo', 'echo']);
  });

  it('refuses unknown jobs and duplicate registrations', async () => {
    const registry = new JobRegistry();
    registry.register({ name: 'x', handler: () => Promise.resolve() });
    expect(() =>
      registry.register({ name: 'x', handler: () => Promise.resolve() }),
    ).toThrow(/twice/);
    await expect(new InlineJobs(registry).enqueue('nope', {})).rejects.toThrow(
      /No handler/,
    );
  });
});
