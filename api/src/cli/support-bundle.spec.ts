import { formatChecks, worst } from './doctor';
import { hashEmail, redactedEnv } from './support-bundle';

describe('support bundle redaction (T3.5)', () => {
  it('keeps configuration keys but never secret values or unrelated variables', () => {
    const env = {
      ACTIVATE_EDITION: 'self-hosted',
      ACTIVATE_SECRETS_KEY: 'super-secret',
      DB: '{"password":"x"}',
      LIBRARY_GIT_TOKEN: 'ghp_abc',
      ANTHROPIC_API_KEY: 'sk-ant-1',
      AUTH_OIDC_CLIENT_SECRET: 's',
      ACTIVATE_LICENSE: 'eyJ...',
      WEB_URL: 'https://activate.example.com',
      HOME: '/home/someone',
      AWS_SECRET_ACCESS_KEY: 'nope',
    };
    const out = redactedEnv(env);
    expect(out.ACTIVATE_EDITION).toBe('self-hosted');
    expect(out.WEB_URL).toBe('https://activate.example.com');
    for (const k of [
      'ACTIVATE_SECRETS_KEY',
      'DB',
      'LIBRARY_GIT_TOKEN',
      'ANTHROPIC_API_KEY',
      'AUTH_OIDC_CLIENT_SECRET',
      'ACTIVATE_LICENSE',
    ])
      expect(out[k]).toMatch(/^<set, \d+ chars>$/);
    expect(out.HOME).toBeUndefined();
    expect(out.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('super-secret');
  });

  it('hashes addresses', () => {
    expect(hashEmail('Jane@Acme.test')).toBe(hashEmail('jane@acme.test'));
    expect(hashEmail('jane@acme.test')).not.toContain('jane');
  });

  it('formats doctor checks the way the guide shows them', () => {
    const checks = [
      { name: 'database', level: 'ok' as const, detail: 'PostgreSQL 16' },
      { name: 'license', level: 'warn' as const, detail: 'expires soon' },
      { name: 'identity', level: 'fail' as const, detail: 'unreachable' },
    ];
    const text = formatChecks(checks);
    expect(text.split('\n')).toEqual([
      '✓ database  PostgreSQL 16',
      '! license   expires soon',
      '✗ identity  unreachable',
    ]);
    expect(worst(checks)).toBe('fail');
    expect(worst(checks.slice(0, 2))).toBe('warn');
    expect(worst(checks.slice(0, 1))).toBe('ok');
  });
});
