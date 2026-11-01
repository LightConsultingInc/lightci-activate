import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { JWTPayload } from 'jose';
import { IsNull, LessThan, Repository } from 'typeorm';
import { authProvider, publicApiUrl } from '../../config/env';
import type { Person } from '../../orgs/entities/person.entity';
import {
  UpstreamOidcService,
  type UpstreamIdentity,
  type UpstreamStart,
} from '../identity/upstream-oidc.service';
import { PeopleService } from '../people.service';
import {
  OAuthClient,
  type TokenEndpointAuthMethod,
} from './entities/oauth-client.entity';
import { OAuthCode } from './entities/oauth-code.entity';
import { OAuthLoginState } from './entities/oauth-login-state.entity';
import { OAuthRefreshToken } from './entities/oauth-refresh-token.entity';
import { KeysService } from './keys.service';
import {
  hashToken,
  isAcceptableRedirectUri,
  randomToken,
  redirectUriAllowed,
  safeEqual,
  verifyPkce,
} from './pkce';

export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
const CODE_TTL_MS = 60 * 1000;
const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
export const WEB_CLIENT_ID = process.env.AUTH_WEB_CLIENT_ID ?? 'activate-web';
const SUPPORTED_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

/** An OAuth error that must be reported as a redirect to the client (RFC 6749 §4.1.2.1). */
export class OAuthRedirectError extends Error {
  constructor(
    public readonly redirectUri: string,
    public readonly state: string | null,
    public readonly code: string,
    description: string,
  ) {
    super(description);
  }
  toUrl(): string {
    const u = new URL(this.redirectUri);
    u.searchParams.set('error', this.code);
    u.searchParams.set('error_description', this.message);
    if (this.state) u.searchParams.set('state', this.state);
    return u.toString();
  }
}

/** An OAuth error for the token or registration endpoints (JSON body, RFC 6749 §5.2). */
export class OAuthTokenError extends Error {
  constructor(
    public readonly status: 400 | 401,
    public readonly code: string,
    description: string,
  ) {
    super(description);
  }
  body() {
    return { error: this.code, error_description: this.message };
  }
}

export interface AuthorizeRequest {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
  login_hint?: string;
}

export interface TokenRequest {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

/**
 * A minimal OAuth 2.1 authorization server for OIDC mode. The customer's IdP remains the
 * identity source; Activate issues its own short-lived access tokens (RS256, aud = this API)
 * for the web app and for Claude's connector, so clients never need to verify a foreign
 * IdP's token format and MCP hosts can register dynamically. Authorization code + PKCE
 * (S256 required) and refresh-token rotation only; no implicit, no passwords, no consent
 * screen (first-party), no client secrets for public clients.
 */
@Injectable()
export class OAuthService implements OnModuleInit {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    @InjectRepository(OAuthClient)
    private readonly clients: Repository<OAuthClient>,
    @InjectRepository(OAuthCode) private readonly codes: Repository<OAuthCode>,
    @InjectRepository(OAuthRefreshToken)
    private readonly refreshTokens: Repository<OAuthRefreshToken>,
    @InjectRepository(OAuthLoginState)
    private readonly states: Repository<OAuthLoginState>,
    private readonly keys: KeysService,
    private readonly upstream: UpstreamOidcService,
    private readonly people: PeopleService,
  ) {}

  get enabled(): boolean {
    return authProvider() === 'oidc';
  }

  get issuer(): string {
    return publicApiUrl();
  }

  /** The web app is a public client whose redirect URI follows WEB_URL. */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const redirect = `${webUrl}/callback`;
    const existing = await this.clients.findOne({
      where: { id: WEB_CLIENT_ID },
    });
    if (existing) {
      if (!existing.redirectUris.includes(redirect)) {
        existing.redirectUris = [redirect];
        await this.clients.save(existing);
      }
      return;
    }
    await this.clients.save(
      this.clients.create({
        id: WEB_CLIENT_ID,
        name: 'Activate web app',
        redirectUris: [redirect],
        tokenEndpointAuthMethod: 'none',
        secretHash: null,
        registeredBy: 'config',
      }),
    );
    this.logger.log(
      `Registered the web app as OAuth client ${WEB_CLIENT_ID} (${redirect})`,
    );
  }

  metadata() {
    const base = this.issuer;
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      revocation_endpoint: `${base}/oauth/revoke`,
      jwks_uri: `${base}/oauth/jwks`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [
        'none',
        'client_secret_post',
        'client_secret_basic',
      ],
      scopes_supported: SUPPORTED_SCOPES,
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      service_documentation: `${base}/docs`,
    };
  }

  // ───────────────────────── dynamic client registration (RFC 7591) ─────────────────────────

  async register(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.map(String)
      : [];
    if (redirectUris.length === 0 || redirectUris.length > 10)
      throw new OAuthTokenError(
        400,
        'invalid_redirect_uri',
        'redirect_uris must list 1 to 10 URIs',
      );
    for (const uri of redirectUris)
      if (!isAcceptableRedirectUri(uri))
        throw new OAuthTokenError(
          400,
          'invalid_redirect_uri',
          `${uri} is not acceptable: use https, or http on localhost`,
        );
    const method =
      (body.token_endpoint_auth_method as
        TokenEndpointAuthMethod | undefined) ?? 'none';
    if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method))
      throw new OAuthTokenError(
        400,
        'invalid_client_metadata',
        'unsupported token_endpoint_auth_method',
      );
    const grantTypes = Array.isArray(body.grant_types)
      ? body.grant_types.map(String)
      : ['authorization_code', 'refresh_token'];
    if (
      grantTypes.some(
        (g) => !['authorization_code', 'refresh_token'].includes(g),
      )
    )
      throw new OAuthTokenError(
        400,
        'invalid_client_metadata',
        'only authorization_code and refresh_token are supported',
      );
    const name =
      typeof body.client_name === 'string' && body.client_name.trim()
        ? body.client_name.trim().slice(0, 120)
        : 'MCP client';
    const secret = method === 'none' ? null : randomToken(32);
    const client = await this.clients.save(
      this.clients.create({
        id: `dcr_${randomToken(16)}`,
        name,
        redirectUris,
        tokenEndpointAuthMethod: method,
        secretHash: secret ? hashToken(secret) : null,
        registeredBy: 'dcr',
        grantTypes,
      }),
    );
    this.logger.log(`Registered OAuth client ${client.id} (${name})`);
    return {
      client_id: client.id,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      grant_types: client.grantTypes,
      response_types: ['code'],
    };
  }

  // ───────────────────────── authorization ─────────────────────────

  /**
   * Validate the client's request and start the upstream sign-in. Errors about the client
   * or redirect URI are thrown as BadRequest (never redirected); everything else redirects
   * back to the client with an error.
   */
  async authorize(q: AuthorizeRequest): Promise<string> {
    if (!q.client_id) throw new BadRequestException('client_id is required');
    let client = await this.clients.findOne({
      where: { id: q.client_id, disabledAt: IsNull() },
    });
    if (!client && q.client_id === WEB_CLIENT_ID) {
      // The web app's registration follows configuration; recreate it if it went missing.
      await this.onModuleInit();
      client = await this.clients.findOne({
        where: { id: q.client_id, disabledAt: IsNull() },
      });
    }
    if (!client) throw new BadRequestException('Unknown client');
    if (
      !q.redirect_uri ||
      !redirectUriAllowed(q.redirect_uri, client.redirectUris)
    )
      throw new BadRequestException(
        'redirect_uri is not registered for this client',
      );
    const state = q.state ?? null;
    const fail = (code: string, description: string) =>
      new OAuthRedirectError(q.redirect_uri!, state, code, description);
    if (q.response_type !== 'code')
      throw fail('unsupported_response_type', 'response_type must be code');
    if (!q.code_challenge)
      throw fail('invalid_request', 'code_challenge is required (PKCE)');
    if ((q.code_challenge_method ?? 'plain') !== 'S256')
      throw fail('invalid_request', 'code_challenge_method must be S256');
    const scope = this.normaliseScope(q.scope);
    if (!scope)
      throw fail(
        'invalid_scope',
        `scope may include ${SUPPORTED_SCOPES.join(', ')}`,
      );
    if (!this.upstream.enabled)
      throw fail(
        'temporarily_unavailable',
        'identity provider is not configured',
      );

    let start: UpstreamStart;
    try {
      start = await this.upstream.start(q.login_hint);
    } catch (e) {
      this.logger.warn(
        `upstream start failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw fail('temporarily_unavailable', 'identity provider is unreachable');
    }
    await this.states.save(
      this.states.create({
        upstreamState: start.state,
        upstreamNonce: start.nonce,
        upstreamCodeVerifier: start.codeVerifier,
        request: {
          clientId: client.id,
          redirectUri: q.redirect_uri,
          state,
          scope,
          codeChallenge: q.code_challenge,
          codeChallengeMethod: 'S256',
          nonce: q.nonce ?? null,
        },
        expiresAt: new Date(Date.now() + LOGIN_STATE_TTL_MS),
      }),
    );
    return start.url;
  }

  /** The IdP sent the person back. Finish upstream, provision them, and hand the client a code. */
  async callback(params: Record<string, string>): Promise<string> {
    const upstreamState = params.state;
    if (!upstreamState) throw new BadRequestException('Missing state');
    const pending = await this.states.findOne({ where: { upstreamState } });
    if (!pending)
      throw new BadRequestException('Unknown or expired sign-in. Start again.');
    await this.states.delete({ id: pending.id });
    const req = pending.request;
    const fail = (code: string, description: string) =>
      new OAuthRedirectError(req.redirectUri, req.state, code, description);
    if (pending.expiresAt.getTime() < Date.now())
      throw fail('access_denied', 'sign-in took too long; start again');
    if (params.error)
      throw fail('access_denied', params.error_description ?? params.error);

    let identity: UpstreamIdentity;
    try {
      identity = await this.upstream.finish(params, {
        state: pending.upstreamState,
        nonce: pending.upstreamNonce,
        codeVerifier: pending.upstreamCodeVerifier,
      });
    } catch (e) {
      this.logger.warn(
        `upstream callback failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw fail(
        'access_denied',
        'the identity provider did not confirm the sign-in',
      );
    }
    const person = await this.people.provisionFromOidc(identity);
    if (person.status === 'inactive')
      throw fail('access_denied', 'this account is deactivated');

    const code = randomToken(32);
    await this.codes.save(
      this.codes.create({
        codeHash: hashToken(code),
        clientId: req.clientId,
        redirectUri: req.redirectUri,
        codeChallenge: req.codeChallenge,
        codeChallengeMethod: req.codeChallengeMethod,
        personId: person.id,
        scope: req.scope,
        nonce: req.nonce,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      }),
    );
    const u = new URL(req.redirectUri);
    u.searchParams.set('code', code);
    if (req.state) u.searchParams.set('state', req.state);
    return u.toString();
  }

  // ───────────────────────── token ─────────────────────────

  async token(
    body: TokenRequest,
    basicAuth: string | undefined,
  ): Promise<TokenResponse> {
    const client = await this.authenticateClient(body, basicAuth);
    switch (body.grant_type) {
      case 'authorization_code':
        return this.exchangeCode(client, body);
      case 'refresh_token':
        return this.refresh(client, body);
      default:
        throw new OAuthTokenError(
          400,
          'unsupported_grant_type',
          'grant_type must be authorization_code or refresh_token',
        );
    }
  }

  private async authenticateClient(
    body: TokenRequest,
    basicAuth: string | undefined,
  ): Promise<OAuthClient> {
    let clientId = body.client_id;
    let secret = body.client_secret;
    if (basicAuth?.toLowerCase().startsWith('basic ')) {
      const decoded = Buffer.from(basicAuth.slice(6).trim(), 'base64').toString(
        'utf8',
      );
      const idx = decoded.indexOf(':');
      if (idx > 0) {
        clientId = decodeURIComponent(decoded.slice(0, idx));
        secret = decodeURIComponent(decoded.slice(idx + 1));
      }
    }
    if (!clientId)
      throw new OAuthTokenError(401, 'invalid_client', 'client_id is required');
    const client = await this.clients.findOne({
      where: { id: clientId, disabledAt: IsNull() },
    });
    if (!client)
      throw new OAuthTokenError(401, 'invalid_client', 'unknown client');
    if (client.tokenEndpointAuthMethod !== 'none') {
      if (
        !secret ||
        !client.secretHash ||
        !safeEqual(hashToken(secret), client.secretHash)
      )
        throw new OAuthTokenError(
          401,
          'invalid_client',
          'client authentication failed',
        );
    }
    return client;
  }

  private async exchangeCode(
    client: OAuthClient,
    body: TokenRequest,
  ): Promise<TokenResponse> {
    if (!body.code)
      throw new OAuthTokenError(400, 'invalid_request', 'code is required');
    const row = await this.codes.findOne({
      where: { codeHash: hashToken(body.code) },
    });
    if (!row || row.clientId !== client.id)
      throw new OAuthTokenError(400, 'invalid_grant', 'unknown code');
    if (row.usedAt) {
      // Replay: revoke everything this code produced (RFC 6819 §5.2.1.1 style).
      await this.refreshTokens.update(
        { personId: row.personId, clientId: client.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new OAuthTokenError(400, 'invalid_grant', 'code already used');
    }
    if (row.expiresAt.getTime() < Date.now())
      throw new OAuthTokenError(400, 'invalid_grant', 'code expired');
    if (body.redirect_uri !== row.redirectUri)
      throw new OAuthTokenError(400, 'invalid_grant', 'redirect_uri mismatch');
    if (
      !verifyPkce(
        body.code_verifier,
        row.codeChallenge,
        row.codeChallengeMethod,
      )
    )
      throw new OAuthTokenError(
        400,
        'invalid_grant',
        'PKCE verification failed',
      );
    await this.codes.update({ id: row.id }, { usedAt: new Date() });
    const person = await this.people.findById(row.personId);
    if (!person || person.status === 'inactive')
      throw new OAuthTokenError(400, 'invalid_grant', 'account unavailable');
    return this.issue(client, person, row.scope);
  }

  private async refresh(
    client: OAuthClient,
    body: TokenRequest,
  ): Promise<TokenResponse> {
    if (!body.refresh_token)
      throw new OAuthTokenError(
        400,
        'invalid_request',
        'refresh_token is required',
      );
    const row = await this.refreshTokens.findOne({
      where: { tokenHash: hashToken(body.refresh_token) },
    });
    if (!row || row.clientId !== client.id)
      throw new OAuthTokenError(400, 'invalid_grant', 'unknown refresh token');
    if (row.revokedAt) {
      // A revoked (already rotated) token being replayed: cut the whole family.
      await this.refreshTokens.update(
        { personId: row.personId, clientId: client.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new OAuthTokenError(400, 'invalid_grant', 'refresh token revoked');
    }
    if (row.expiresAt.getTime() < Date.now())
      throw new OAuthTokenError(400, 'invalid_grant', 'refresh token expired');
    const person = await this.people.findById(row.personId);
    if (!person || person.status === 'inactive') {
      await this.refreshTokens.update(
        { id: row.id },
        { revokedAt: new Date() },
      );
      throw new OAuthTokenError(400, 'invalid_grant', 'account unavailable');
    }
    const next = await this.issue(client, person, row.scope);
    const replacement = await this.refreshTokens.findOne({
      where: { tokenHash: hashToken(next.refresh_token!) },
    });
    await this.refreshTokens.update(
      { id: row.id },
      { revokedAt: new Date(), replacedById: replacement?.id ?? null },
    );
    return next;
  }

  private async issue(
    client: OAuthClient,
    person: Person,
    scope: string,
  ): Promise<TokenResponse> {
    const access_token = await this.keys.sign(
      {
        sub: person.id,
        client_id: client.id,
        scope,
        email: person.email,
        name: person.name,
      },
      {
        issuer: this.issuer,
        audience: this.issuer,
        expiresInSeconds: ACCESS_TOKEN_TTL_S,
      },
    );
    const refresh = randomToken(32);
    await this.refreshTokens.save(
      this.refreshTokens.create({
        tokenHash: hashToken(refresh),
        clientId: client.id,
        personId: person.id,
        scope,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_S * 1000),
      }),
    );
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      refresh_token: refresh,
      scope,
    };
  }

  /** RFC 7009: revoking an unknown token is still a 200. */
  async revoke(
    token: string | undefined,
    body: TokenRequest,
    basicAuth: string | undefined,
  ): Promise<void> {
    if (!token) return;
    let client: OAuthClient;
    try {
      client = await this.authenticateClient(body, basicAuth);
    } catch {
      return;
    }
    await this.refreshTokens.update(
      { tokenHash: hashToken(token), clientId: client.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Verify an access token this server issued and load its person. Null when it is not ours or invalid. */
  async resolveAccessToken(token: string): Promise<Person | null> {
    let payload: JWTPayload;
    try {
      payload = await this.keys.verify(token, {
        issuer: this.issuer,
        audience: this.issuer,
      });
    } catch {
      return null;
    }
    if (typeof payload.sub !== 'string') return null;
    const person = await this.people.findById(payload.sub);
    if (!person || person.status === 'inactive')
      throw new UnauthorizedException('Account unavailable');
    return person;
  }

  /** Housekeeping: drop expired codes and login states (called from the worker). */
  async sweep(): Promise<void> {
    const now = new Date();
    await this.codes.delete({
      expiresAt: LessThan(new Date(now.getTime() - 60 * 60 * 1000)),
    });
    await this.states.delete({ expiresAt: LessThan(now) });
    await this.refreshTokens.delete({
      expiresAt: LessThan(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
    });
  }

  private normaliseScope(raw: string | undefined): string | null {
    const requested = (raw ?? 'openid profile email')
      .split(/\s+/)
      .filter(Boolean);
    if (requested.some((s) => !SUPPORTED_SCOPES.includes(s))) return null;
    const set = new Set(requested);
    set.add('openid');
    return [...set].join(' ');
  }
}
