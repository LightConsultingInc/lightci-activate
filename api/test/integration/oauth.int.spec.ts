/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
/**
 * Activate's OAuth server in OIDC mode against a real Keycloak (T1.7, T1.8, T1.9, T1.11
 * automated part) and the local Postgres from api/.env. Start Keycloak first:
 *   ./test/keycloak/start.sh
 */
import { API_ORIGIN, ISSUER, KC_PASSWORD, WEB_ORIGIN } from './oidc-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SignJWT, generateKeyPair } from 'jose';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/common/http-exception.filter';
import { OAuthClient } from '../../src/auth/oauth/entities/oauth-client.entity';
import { OAuthCode } from '../../src/auth/oauth/entities/oauth-code.entity';
import { OAuthRefreshToken } from '../../src/auth/oauth/entities/oauth-refresh-token.entity';
import { randomToken, sha256Base64url } from '../../src/auth/oauth/pkce';
import { DEFAULT_ROLE_MAPPING } from '../../src/auth/role-mapping';
import { Org } from '../../src/orgs/entities/org.entity';
import { Person } from '../../src/orgs/entities/person.entity';
import { keycloakLogin } from './keycloak-login';

const WEB_REDIRECT = `${WEB_ORIGIN}/callback`;

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

describe('OAuth server (OIDC mode) against Keycloak', () => {
  let app: INestApplication;
  let ds: DataSource;
  let orgId: string;
  const createdClients: string[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const discovery = await fetch(
      `${ISSUER}/.well-known/openid-configuration`,
    ).catch(() => null);
    if (!discovery?.ok)
      throw new Error(
        `Keycloak is not reachable at ${ISSUER}. Run api/test/keycloak/start.sh first.`,
      );

    // The real application module, so discovery, people and roles behave exactly as in production.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({
      rawBody: true,
      logger: ['error', 'warn'],
    });
    app.setGlobalPrefix('api', {
      exclude: ['mcp', 'mcp/(.*)', '.well-known/(.*)', 'oauth', 'oauth/(.*)'],
    });
    // Same error shape as production (main.ts registers the same filter).
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    ds = app.get(DataSource);

    const org = await ds.getRepository(Org).save(
      ds.getRepository(Org).create({
        name: 'Acme (OIDC integration)',
        slug: `acme-oidc-${Date.now()}`,
        emailDomains: ['acme.test'],
        settings: { identity: { roleMapping: DEFAULT_ROLE_MAPPING } },
        isDemo: false,
        seats: 10,
      }),
    );
    orgId = org.id;
  }, 120_000);

  afterAll(async () => {
    if (ds) {
      await ds.getRepository(Person).delete({ identityIssuer: ISSUER });
      await ds.getRepository(Org).delete({ id: orgId });
      for (const id of createdClients) {
        await ds.getRepository(OAuthCode).delete({ clientId: id });
        await ds.getRepository(OAuthRefreshToken).delete({ clientId: id });
        await ds.getRepository(OAuthClient).delete({ id });
      }
    }
    await app?.close();
  });

  /** Authorization code flow end to end for the web client, returning the code and verifier. */
  async function signIn(
    username: string,
    clientId = 'activate-web',
    redirectUri = WEB_REDIRECT,
  ) {
    const verifier = randomToken(48);
    const state = randomToken(8);
    const start = await http()
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'openid profile email offline_access',
        state,
        code_challenge: sha256Base64url(verifier),
        code_challenge_method: 'S256',
      });
    expect(start.status).toBe(302);
    const upstream = start.headers.location;
    expect(upstream.startsWith(`${ISSUER}/protocol/openid-connect/auth`)).toBe(
      true,
    );
    const back = await keycloakLogin(upstream, username, KC_PASSWORD);
    expect(back.origin + back.pathname).toBe(`${API_ORIGIN}/oauth/callback`);
    const cb = await http().get(`/oauth/callback${back.search}`);
    expect(cb.status).toBe(302);
    const final = new URL(cb.headers.location);
    expect(final.origin + final.pathname).toBe(redirectUri);
    expect(final.searchParams.get('state')).toBe(state);
    expect(final.searchParams.get('error')).toBeNull();
    const code = final.searchParams.get('code')!;
    expect(code).toBeTruthy();
    return { code, verifier };
  }

  function exchange(
    code: string,
    verifier: string,
    clientId = 'activate-web',
    redirectUri = WEB_REDIRECT,
  ) {
    return http().post('/oauth/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: clientId,
    });
  }

  it('publishes Activate as the authorization server for the connector', async () => {
    const as = await http()
      .get('/.well-known/oauth-authorization-server')
      .expect(200);
    expect(as.body).toMatchObject({
      issuer: API_ORIGIN,
      authorization_endpoint: `${API_ORIGIN}/oauth/authorize`,
      token_endpoint: `${API_ORIGIN}/oauth/token`,
      registration_endpoint: `${API_ORIGIN}/oauth/register`,
      jwks_uri: `${API_ORIGIN}/oauth/jwks`,
      code_challenge_methods_supported: ['S256'],
    });
    const pr = await http()
      .get('/.well-known/oauth-protected-resource')
      .expect(200);
    expect(pr.body.authorization_servers).toEqual([API_ORIGIN]);
    expect(pr.body.resource).toBe(`${API_ORIGIN}/mcp`);
    const jwks = await http().get('/oauth/jwks').expect(200);
    expect(jwks.body.keys[0]).toMatchObject({
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
    });
    expect(jwks.body.keys[0].d).toBeUndefined();
  });

  it('registers MCP hosts dynamically and refuses unsafe redirect URIs', async () => {
    const ok = await http()
      .post('/oauth/register')
      .send({
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      })
      .expect(201);
    expect(ok.body.client_id).toMatch(/^dcr_/);
    expect(ok.body.client_secret).toBeUndefined();
    expect(ok.body.token_endpoint_auth_method).toBe('none');
    createdClients.push(ok.body.client_id);

    const bad = await http()
      .post('/oauth/register')
      .send({ redirect_uris: ['http://evil.example/cb'] })
      .expect(400);
    expect(bad.body.error).toBe('invalid_redirect_uri');
    await http()
      .post('/oauth/register')
      .send({ redirect_uris: [] })
      .expect(400);
  });

  it('validates authorize requests: client and redirect errors never redirect, others do', async () => {
    await http()
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: 'nope',
        redirect_uri: WEB_REDIRECT,
      })
      .expect(400);
    await http()
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: 'activate-web',
        redirect_uri: 'https://attacker.example/cb',
        code_challenge: 'x',
        code_challenge_method: 'S256',
      })
      .expect(400);
    const noPkce = await http()
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: 'activate-web',
        redirect_uri: WEB_REDIRECT,
        state: 's1',
      })
      .expect(302);
    const u1 = new URL(noPkce.headers.location);
    expect(u1.origin + u1.pathname).toBe(WEB_REDIRECT);
    expect(u1.searchParams.get('error')).toBe('invalid_request');
    expect(u1.searchParams.get('state')).toBe('s1');
    const plain = await http()
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: 'activate-web',
        redirect_uri: WEB_REDIRECT,
        code_challenge: 'x',
        code_challenge_method: 'plain',
      })
      .expect(302);
    expect(new URL(plain.headers.location).searchParams.get('error')).toBe(
      'invalid_request',
    );
    const token = await http()
      .get('/oauth/authorize')
      .query({
        response_type: 'token',
        client_id: 'activate-web',
        redirect_uri: WEB_REDIRECT,
        code_challenge: sha256Base64url(randomToken()),
        code_challenge_method: 'S256',
      })
      .expect(302);
    expect(new URL(token.headers.location).searchParams.get('error')).toBe(
      'unsupported_response_type',
    );
  });

  it('signs a person in through Keycloak, maps their groups to roles, and issues working tokens', async () => {
    const { code, verifier } = await signIn('jane');
    const res = await exchange(code, verifier).expect(200);
    const tokens = res.body as Tokens;
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.refresh_token).toBeTruthy();
    expect(res.headers['cache-control']).toContain('no-store');

    const me = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .expect(200);
    expect(me.body.user.email).toBe('jane.doe@acme.test');
    expect(me.body.user.name).toBe('Jane Doe');
    expect(me.body.user.roles.sort()).toEqual(['admin', 'learner', 'sponsor']);
    expect(me.body.org.id).toBe(orgId);

    const person = await ds
      .getRepository(Person)
      .findOneByOrFail({ email: 'jane.doe@acme.test' });
    expect(person.identityIssuer).toBe(ISSUER);
    expect(person.identitySubject).toBeTruthy();
    expect(person.workosUserId).toBeNull();

    // the code is single use, and a replay revokes what it produced
    const replay = await exchange(code, verifier).expect(400);
    expect(replay.body.error).toBe('invalid_grant');
    const afterReplay = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'activate-web',
      })
      .expect(400);
    expect(afterReplay.body.error).toBe('invalid_grant');
  }, 60_000);

  it('rotates refresh tokens and cuts the family on replay', async () => {
    const { code, verifier } = await signIn('jane');
    const first = (await exchange(code, verifier).expect(200)).body as Tokens;
    const second = (
      await http()
        .post('/oauth/token')
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: first.refresh_token,
          client_id: 'activate-web',
        })
        .expect(200)
    ).body as Tokens;
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(second.access_token).not.toBe(first.access_token);
    await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${second.access_token}`)
      .expect(200);

    // replaying the rotated-out token revokes the new one too
    const replay = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: first.refresh_token,
        client_id: 'activate-web',
      })
      .expect(400);
    expect(replay.body.error).toBe('invalid_grant');
    const dead = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: second.refresh_token,
        client_id: 'activate-web',
      })
      .expect(400);
    expect(dead.body.error).toBe('invalid_grant');
  }, 60_000);

  it('rejects a wrong PKCE verifier, a wrong redirect_uri, and a wrong client at the token endpoint', async () => {
    const a = await signIn('dan');
    expect(
      (await exchange(a.code, randomToken(48)).expect(400)).body.error,
    ).toBe('invalid_grant');
    const b = await signIn('dan');
    expect(
      (
        await exchange(
          b.code,
          b.verifier,
          'activate-web',
          `${WEB_ORIGIN}/other`,
        ).expect(400)
      ).body.error,
    ).toBe('invalid_grant');
    const c = await signIn('dan');
    expect(
      (await exchange(c.code, c.verifier, createdClients[0]).expect(400)).body
        .error,
    ).toBe('invalid_grant');
    await http()
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'authorization_code', code: 'x', client_id: 'ghost' })
      .expect(401);
    await http()
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'password', client_id: 'activate-web' })
      .expect(400);
  }, 90_000);

  it('a champion group becomes the champion role; no groups means learner; a lead domain means lead', async () => {
    const dan = await signIn('dan');
    const danTokens = (await exchange(dan.code, dan.verifier).expect(200))
      .body as Tokens;
    const danMe = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${danTokens.access_token}`)
      .expect(200);
    expect(danMe.body.user.roles.sort()).toEqual(['champion', 'learner']);

    const sam = await signIn('sam');
    const samTokens = (await exchange(sam.code, sam.verifier).expect(200))
      .body as Tokens;
    const samMe = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${samTokens.access_token}`)
      .expect(200);
    expect(samMe.body.user.roles).toEqual(['learner']);
    expect(samMe.body.org.id).toBe(orgId);

    const zain = await signIn('zain');
    const zainTokens = (await exchange(zain.code, zain.verifier).expect(200))
      .body as Tokens;
    const zainMe = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${zainTokens.access_token}`)
      .expect(200);
    expect(zainMe.body.user.roles).toEqual(['lead']);
    expect(zainMe.body.user.orgId).toBeNull();
  }, 120_000);

  it('a confidential MCP client must authenticate; a public one uses PKCE only', async () => {
    const reg = await http()
      .post('/oauth/register')
      .send({
        client_name: 'Confidential host',
        redirect_uris: ['https://host.example/cb'],
        token_endpoint_auth_method: 'client_secret_post',
      })
      .expect(201);
    createdClients.push(reg.body.client_id);
    expect(reg.body.client_secret).toBeTruthy();
    const { code, verifier } = await signIn(
      'sam',
      reg.body.client_id,
      'https://host.example/cb',
    );
    const noSecret = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://host.example/cb',
        code_verifier: verifier,
        client_id: reg.body.client_id,
      })
      .expect(401);
    expect(noSecret.body.error).toBe('invalid_client');
    const withSecret = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://host.example/cb',
        code_verifier: verifier,
        client_id: reg.body.client_id,
        client_secret: reg.body.client_secret,
      })
      .expect(200);
    expect(withSecret.body.access_token).toBeTruthy();
  }, 60_000);

  it('rejects tokens that are not ours: foreign issuer, bad audience, expired, tampered', async () => {
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ sub: 'someone' })
      .setProtectedHeader({ alg: 'RS256', kid: 'x' })
      .setIssuer(API_ORIGIN)
      .setAudience(API_ORIGIN)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    await http()
      .get('/api/people')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);

    const { code, verifier } = await signIn('sam');
    const tokens = (await exchange(code, verifier).expect(200)).body as Tokens;
    const [h, p, s] = tokens.access_token.split('.');
    const payload = JSON.parse(
      Buffer.from(p, 'base64url').toString(),
    ) as Record<string, unknown>;
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...payload, sub: '00000000-0000-4000-8000-000000000000' })).toString('base64url')}.${s}`;
    await http()
      .get('/api/people')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);
    await http()
      .get('/api/exercises')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .expect(200);
  }, 60_000);

  it('a deactivated person cannot use or refresh their tokens', async () => {
    const { code, verifier } = await signIn('sam');
    const tokens = (await exchange(code, verifier).expect(200)).body as Tokens;
    await ds
      .getRepository(Person)
      .update({ email: 'sam.learner@acme.test' }, { status: 'inactive' });
    await http()
      .get('/api/people')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .expect(401);
    const refresh = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'activate-web',
      })
      .expect(400);
    expect(refresh.body.error).toBe('invalid_grant');
    await ds
      .getRepository(Person)
      .update({ email: 'sam.learner@acme.test' }, { status: 'active' });
  }, 60_000);

  it('Claude-style host: dynamic registration, PKCE sign-in, then an MCP tools/list call with the token', async () => {
    const reg = await http()
      .post('/oauth/register')
      .send({
        client_name: 'MCP host (test)',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      })
      .expect(201);
    createdClients.push(reg.body.client_id);
    const { code, verifier } = await signIn(
      'jane',
      reg.body.client_id,
      'https://claude.ai/api/mcp/auth_callback',
    );
    const tokens = (
      await exchange(
        code,
        verifier,
        reg.body.client_id,
        'https://claude.ai/api/mcp/auth_callback',
      ).expect(200)
    ).body as Tokens;

    const unauth = await http()
      .post('/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(401);
    expect(unauth.headers['www-authenticate']).toContain(
      '/.well-known/oauth-protected-resource',
    );

    const list = await http()
      .post('/mcp')
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
      .expect(200);
    const names = (list.body.result.tools as { name: string }[]).map(
      (t) => t.name,
    );
    expect(names).toEqual(
      expect.arrayContaining(['my_ladder', 'library', 'team', 'org']),
    );
  }, 60_000);

  it('revocation ends a refresh token', async () => {
    const { code, verifier } = await signIn('sam');
    const tokens = (await exchange(code, verifier).expect(200)).body as Tokens;
    await http()
      .post('/oauth/revoke')
      .type('form')
      .send({ token: tokens.refresh_token, client_id: 'activate-web' })
      .expect(200);
    const after = await http()
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'activate-web',
      })
      .expect(400);
    expect(after.body.error).toBe('invalid_grant');
  }, 60_000);
});
