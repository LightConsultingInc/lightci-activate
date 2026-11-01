import { Injectable, Logger } from '@nestjs/common';
import { Issuer, generators, type Client, type TokenSet } from 'openid-client';
import { authProvider, publicApiUrl } from '../../config/env';

/** What we learn about a person from the customer's identity provider. */
export interface UpstreamIdentity {
  issuer: string;
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  groups: string[];
}

export interface UpstreamStart {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * The customer's OpenID Connect provider (Okta, Entra ID, Keycloak, Google…), discovered
 * from AUTH_OIDC_ISSUER. Activate is a confidential client of it; Activate's own OAuth
 * server (oauth/) fronts it for the web app and for Claude.
 */
@Injectable()
export class UpstreamOidcService {
  private readonly logger = new Logger(UpstreamOidcService.name);
  private client: Promise<Client> | null = null;

  get enabled(): boolean {
    return authProvider() === 'oidc' && Boolean(process.env.AUTH_OIDC_ISSUER);
  }

  get issuerUrl(): string {
    return (process.env.AUTH_OIDC_ISSUER ?? '').replace(/\/$/, '');
  }

  get redirectUri(): string {
    return `${publicApiUrl()}/oauth/callback`;
  }

  get scopes(): string {
    return process.env.AUTH_OIDC_SCOPES ?? 'openid profile email';
  }

  get groupsClaim(): string {
    return process.env.AUTH_GROUPS_CLAIM ?? 'groups';
  }

  /** Discover once; a failure is retried on the next call rather than cached. */
  private getClient(): Promise<Client> {
    if (!this.client) {
      this.client = Issuer.discover(this.issuerUrl)
        .then((issuer) => {
          const secret = process.env.AUTH_OIDC_CLIENT_SECRET;
          return new issuer.Client({
            client_id: process.env.AUTH_OIDC_CLIENT_ID ?? '',
            ...(secret ? { client_secret: secret } : {}),
            redirect_uris: [this.redirectUri],
            response_types: ['code'],
            token_endpoint_auth_method: secret ? 'client_secret_basic' : 'none',
          });
        })
        .catch((e: unknown) => {
          this.client = null;
          throw e;
        });
    }
    return this.client;
  }

  /** True when discovery and the JWKS answer; used by /api/ready and doctor. */
  async probe(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = await this.getClient();
      const jwksUri = client.issuer.metadata.jwks_uri;
      if (!jwksUri)
        return { ok: false, detail: 'issuer publishes no jwks_uri' };
      const res = await fetch(jwksUri, { signal: AbortSignal.timeout(5000) });
      return res.ok
        ? {
            ok: true,
            detail: `issuer ${this.issuerUrl} discovered, JWKS reachable`,
          }
        : { ok: false, detail: `JWKS returned ${res.status}` };
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  async start(loginHint?: string): Promise<UpstreamStart> {
    const client = await this.getClient();
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const url = client.authorizationUrl({
      scope: this.scopes,
      state,
      nonce,
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      ...(loginHint ? { login_hint: loginHint } : {}),
    });
    return { url, state, nonce, codeVerifier };
  }

  /** Exchange the IdP's code and read who signed in. Throws on any verification failure. */
  async finish(
    params: Record<string, string>,
    expected: { state: string; nonce: string; codeVerifier: string },
  ): Promise<UpstreamIdentity> {
    const client = await this.getClient();
    const tokenSet: TokenSet = await client.callback(this.redirectUri, params, {
      state: expected.state,
      nonce: expected.nonce,
      code_verifier: expected.codeVerifier,
    });
    const claims: Record<string, unknown> = { ...tokenSet.claims() };
    // Groups and names often live only in userinfo; merge it in when we have an access token.
    if (tokenSet.access_token) {
      try {
        Object.assign(claims, await client.userinfo(tokenSet));
      } catch (e) {
        this.logger.debug(
          `userinfo unavailable: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    const email =
      typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!email)
      throw new Error('The identity provider returned no email address');
    const rawGroups = claims[this.groupsClaim];
    const groups = Array.isArray(rawGroups)
      ? rawGroups.map(String)
      : typeof rawGroups === 'string'
        ? rawGroups.split(/[,\s]+/).filter(Boolean)
        : [];
    return {
      issuer: client.issuer.metadata.issuer,
      subject: String(claims.sub),
      email,
      name:
        (typeof claims.name === 'string' && claims.name) ||
        [claims.given_name, claims.family_name]
          .filter((v) => typeof v === 'string')
          .join(' ') ||
        null,
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : null,
      groups,
    };
  }
}
