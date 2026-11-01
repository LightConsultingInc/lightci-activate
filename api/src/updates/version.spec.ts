import { APP_VERSION, compareVersions, isNewer } from './version';

describe('version compare', () => {
  it('orders X.Y.Z numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('v1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(isNewer('1.0.1', '1.0.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.1')).toBe(false);
  });

  it('pre-releases sort before the release they precede', () => {
    expect(isNewer('1.1.0', '1.1.0-rc.1')).toBe(true);
    expect(isNewer('1.1.0-rc.1', '1.1.0')).toBe(false);
    expect(isNewer('1.1.0-rc.2', '1.1.0-rc.1')).toBe(true);
  });

  it('reads the running version from package.json', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
