import { parseArgs } from './cli';

describe('activate CLI argument parsing (T0.8)', () => {
  it('defaults to help', () => {
    expect(parseArgs([]).command).toBe('help');
  });

  it('separates flags from positional arguments', () => {
    const parsed = parseArgs(['migrate', '--check']);
    expect(parsed.command).toBe('migrate');
    expect(parsed.flags.has('--check')).toBe(true);
    expect(parsed.rest).toEqual([]);
  });
});
