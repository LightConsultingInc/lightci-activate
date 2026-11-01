import {
  hashToken,
  isAcceptableRedirectUri,
  randomToken,
  redirectUriAllowed,
  sha256Base64url,
  verifyPkce,
} from './pkce';

describe('PKCE and token helpers (T1.8)', () => {
  it('verifies S256 challenges and rejects everything else', () => {
    const verifier = randomToken(32); // 43 chars
    const challenge = sha256Base64url(verifier);
    expect(verifyPkce(verifier, challenge, 'S256')).toBe(true);
    expect(verifyPkce(verifier, challenge, 'plain')).toBe(false);
    expect(verifyPkce(`${verifier}x`, challenge, 'S256')).toBe(false);
    expect(verifyPkce(undefined, challenge, 'S256')).toBe(false);
    expect(verifyPkce('short', sha256Base64url('short'), 'S256')).toBe(false);
    expect(verifyPkce('a'.repeat(43) + '!', challenge, 'S256')).toBe(false);
  });

  it('hashes tokens deterministically and never stores the raw value', () => {
    const raw = randomToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
    expect(hashToken(raw)).not.toContain(raw);
    expect(hashToken(raw)).toHaveLength(64);
  });

  it('accepts https and loopback http redirect URIs only, matched exactly', () => {
    expect(
      isAcceptableRedirectUri('https://claude.ai/api/mcp/auth_callback'),
    ).toBe(true);
    expect(isAcceptableRedirectUri('http://localhost:3000/callback')).toBe(
      true,
    );
    expect(isAcceptableRedirectUri('http://127.0.0.1:8080/cb')).toBe(true);
    expect(isAcceptableRedirectUri('http://example.com/cb')).toBe(false);
    expect(isAcceptableRedirectUri('https://x.com/cb#frag')).toBe(false);
    expect(isAcceptableRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAcceptableRedirectUri('nonsense')).toBe(false);
    expect(redirectUriAllowed('https://a/cb', ['https://a/cb'])).toBe(true);
    expect(redirectUriAllowed('https://a/cb?x=1', ['https://a/cb'])).toBe(
      false,
    );
    expect(redirectUriAllowed('https://a/cb/', ['https://a/cb'])).toBe(false);
  });
});
