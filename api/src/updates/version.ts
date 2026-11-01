import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The running release, from package.json (dist/updates → ../../package.json; same from src). */
export const APP_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return process.env.ACTIVATE_VERSION ?? '0.0.0';
  }
})();

/** Semantic version compare on X.Y.Z (pre-release suffixes sort before the release). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-');
    const nums = core.split('.').map((n) => Number(n) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++)
    if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

export const isNewer = (candidate: string, current: string): boolean =>
  compareVersions(candidate, current) > 0;
