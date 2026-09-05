import {
  fallbackAuthorizationServerMetadata,
  mergeAuthorizationServerMetadata,
  protectedResourceMetadata,
  requestOrigin,
  wwwAuthenticate,
} from './oauth-metadata';
import { SERVER_INSTRUCTIONS } from './instructions';

const CLIENT = 'client_01TEST';

describe('OAuth discovery metadata', () => {
  it('protected resource points hosts at WorkOS', () => {
    expect(
      protectedResourceMetadata(
        'https://lightci-activate-api.lciventure.com/',
        CLIENT,
      ),
    ).toEqual({
      resource: 'https://lightci-activate-api.lciventure.com/mcp',
      authorization_servers: [
        'https://api.workos.com/user_management/client_01TEST',
      ],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'profile', 'email'],
      resource_name: 'LightCI Activate',
      resource_documentation:
        'https://lightci-activate-api.lciventure.com/docs',
    });
  });

  it('fallback authorization server metadata uses WorkOS endpoints', () => {
    const m = fallbackAuthorizationServerMetadata(CLIENT);
    expect(m.issuer).toBe(
      'https://api.workos.com/user_management/client_01TEST',
    );
    expect(m.authorization_endpoint).toBe(
      'https://api.workos.com/user_management/authorize',
    );
    expect(m.token_endpoint).toBe(
      'https://api.workos.com/user_management/authenticate',
    );
    expect(m.jwks_uri).toBe('https://api.workos.com/sso/jwks/client_01TEST');
    expect(m.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('upstream discovery overrides fallback but never removes required fields', () => {
    const m = mergeAuthorizationServerMetadata(CLIENT, {
      issuer: 'https://api.workos.com/user_management/client_01TEST',
      response_types_supported: ['code'],
      extra: 1,
    });
    expect(m.extra).toBe(1);
    expect(m.token_endpoint).toBe(
      'https://api.workos.com/user_management/authenticate',
    );
    expect(
      mergeAuthorizationServerMetadata(CLIENT, null).grant_types_supported,
    ).toContain('authorization_code');
  });

  it('WWW-Authenticate carries resource_metadata', () => {
    expect(wwwAuthenticate('http://localhost:4000')).toBe(
      'Bearer resource_metadata="http://localhost:4000/.well-known/oauth-protected-resource", scope="openid profile email"',
    );
  });

  it('requestOrigin honours proxy headers and PUBLIC_API_URL', () => {
    const prev = process.env.PUBLIC_API_URL;
    delete process.env.PUBLIC_API_URL;
    expect(
      requestOrigin({ headers: { host: 'localhost:4000' }, protocol: 'http' }),
    ).toBe('http://localhost:4000');
    expect(
      requestOrigin({
        headers: {
          host: 'internal:3000',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'lightci-activate-api.lciventure.com',
        },
        protocol: 'http',
      }),
    ).toBe('https://lightci-activate-api.lciventure.com');
    process.env.PUBLIC_API_URL = 'https://fixed.example.com/';
    expect(requestOrigin({ headers: { host: 'x' } })).toBe(
      'https://fixed.example.com',
    );
    if (prev === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = prev;
  });

  it('server instructions stay under 1.5 KB of routing text', () => {
    expect(Buffer.byteLength(SERVER_INSTRUCTIONS, 'utf8')).toBeLessThanOrEqual(
      1536,
    );
    expect(SERVER_INSTRUCTIONS).toContain('my_ladder');
  });
});
