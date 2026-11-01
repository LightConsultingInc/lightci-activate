import { RateLimiter, decideSignIn } from './lookup.service';

describe('decideSignIn (T1.3)', () => {
  it('routes a company with an identity organisation to SSO', () => {
    expect(
      decideSignIn(
        { workosOrganizationId: 'org_1', isDemo: false },
        { passwordLogin: false },
      ),
    ).toEqual({ mode: 'sso', organizationId: 'org_1', passwordAllowed: false });
  });

  it('keeps the password form for demo organisations and when explicitly allowed', () => {
    expect(
      decideSignIn(
        { workosOrganizationId: 'org_1', isDemo: true },
        { passwordLogin: false },
      ),
    ).toEqual({ mode: 'password', passwordAllowed: true });
    expect(
      decideSignIn(
        { workosOrganizationId: 'org_1', isDemo: false },
        { passwordLogin: true },
      ).passwordAllowed,
    ).toBe(true);
  });

  it('says unknown for domains it does not know, without leaking anything else', () => {
    expect(decideSignIn(null, { passwordLogin: false })).toEqual({
      mode: 'unknown',
      passwordAllowed: true,
    });
    expect(
      decideSignIn(
        { workosOrganizationId: null, isDemo: false },
        { passwordLogin: false },
      ).mode,
    ).toBe('unknown');
  });
});

describe('RateLimiter (T1.3)', () => {
  it('allows the limit within a window, then refuses until the window rolls', () => {
    let t = 0;
    const limiter = new RateLimiter(3, 1000, () => t);
    expect([1, 2, 3].map(() => limiter.take('ip'))).toEqual([true, true, true]);
    expect(limiter.take('ip')).toBe(false);
    expect(limiter.take('other-ip')).toBe(true);
    t = 1000;
    expect(limiter.take('ip')).toBe(true);
  });
});
