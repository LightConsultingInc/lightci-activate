import { SecretsService } from './secrets.service';

const ENV_KEYS = [
  'NODE_ENV',
  'ACTIVATE_SECRETS_KEY',
  'ACTIVATE_SECRETS_KEY_PREVIOUS',
] as const;

function withEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) {
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
  return () => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

describe('SecretsService (T0.2)', () => {
  it('refuses to start in production without a key', () => {
    const restore = withEnv({ NODE_ENV: 'production' });
    try {
      expect(() => new SecretsService()).toThrow(
        /ACTIVATE_SECRETS_KEY is required/,
      );
    } finally {
      restore();
    }
  });

  it('falls back to a development key outside production', () => {
    const restore = withEnv({ NODE_ENV: 'test' });
    try {
      const s = new SecretsService();
      expect(s.decrypt(s.encrypt('hello'))).toBe('hello');
    } finally {
      restore();
    }
  });

  it('round-trips with a configured key and rejects another key', () => {
    const restoreA = withEnv({
      NODE_ENV: 'production',
      ACTIVATE_SECRETS_KEY: 'A',
    });
    const a = new SecretsService();
    const payload = a.encrypt('sk-ant-secret');
    restoreA();
    const restoreB = withEnv({
      NODE_ENV: 'production',
      ACTIVATE_SECRETS_KEY: 'B',
    });
    try {
      const b = new SecretsService();
      expect(() => b.decrypt(payload)).toThrow(/could not be decrypted/);
    } finally {
      restoreB();
    }
  });

  it('decrypts with a previous key during rotation and re-encrypts to the current one', () => {
    const restoreA = withEnv({ ACTIVATE_SECRETS_KEY: 'A' });
    const a = new SecretsService();
    const old = a.encrypt('token-1');
    restoreA();

    const restoreB = withEnv({
      ACTIVATE_SECRETS_KEY: 'B',
      ACTIVATE_SECRETS_KEY_PREVIOUS: 'stale, A',
    });
    try {
      const b = new SecretsService();
      expect(b.decrypt(old)).toBe('token-1');
      expect(b.needsRotation(old)).toBe(true);
      const fresh = b.reencrypt(old);
      expect(fresh).not.toBe(old);
      expect(b.needsRotation(fresh)).toBe(false);
      expect(b.reencrypt(fresh)).toBe(fresh);
      expect(b.decrypt(fresh)).toBe('token-1');
    } finally {
      restoreB();
    }
  });

  it('rejects an unknown envelope version', () => {
    const restore = withEnv({ ACTIVATE_SECRETS_KEY: 'A' });
    try {
      expect(() => new SecretsService().decrypt('v9.a.b.c')).toThrow(
        /envelope/,
      );
    } finally {
      restore();
    }
  });
});
