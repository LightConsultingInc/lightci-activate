import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Pure helpers for codes, tokens and PKCE. No I/O. */

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Base64url(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

/** Hash for storing codes and refresh tokens: never the raw value. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** RFC 7636 S256 check. Verifiers are 43–128 unreserved characters. */
export function verifyPkce(
  verifier: string | undefined,
  challenge: string,
  method: string,
): boolean {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) return false;
  if (method !== 'S256') return false;
  const expected = Buffer.from(sha256Base64url(verifier));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Redirect URIs we accept at registration: https anywhere, http only on loopback. */
export function isAcceptableRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:')
      return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    return false;
  } catch {
    return false;
  }
}

/** Exact-match comparison per OAuth 2.1 (no wildcard, no prefix). */
export function redirectUriAllowed(
  uri: string,
  allowed: readonly string[],
): boolean {
  return allowed.some((a) => a === uri);
}
