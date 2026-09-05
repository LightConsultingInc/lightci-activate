/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) and Authorization Server Metadata (RFC 8414)
 * for MCP hosts. WorkOS User Management is the authorization server; the API is the resource.
 * Pure functions so they can be unit-tested without Nest.
 */
export const WORKOS_API = 'https://api.workos.com';

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: string[];
  resource_name: string;
  resource_documentation?: string;
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
  [key: string]: unknown;
}

export function workosIssuer(clientId: string): string {
  return `${WORKOS_API}/user_management/${clientId}`;
}

export function protectedResourceMetadata(
  origin: string,
  clientId: string,
): ProtectedResourceMetadata {
  const base = origin.replace(/\/$/, '');
  return {
    resource: `${base}/mcp`,
    authorization_servers: [workosIssuer(clientId)],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'profile', 'email'],
    resource_name: 'LightCI Activate',
    resource_documentation: `${base}/docs`,
  };
}

/** Metadata built from what we know about WorkOS when the upstream document is unavailable. */
export function fallbackAuthorizationServerMetadata(
  clientId: string,
): AuthorizationServerMetadata {
  return {
    issuer: workosIssuer(clientId),
    authorization_endpoint: `${WORKOS_API}/user_management/authorize`,
    token_endpoint: `${WORKOS_API}/user_management/authenticate`,
    jwks_uri: `${WORKOS_API}/sso/jwks/${clientId}`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['openid', 'profile', 'email'],
  };
}

/**
 * Merge WorkOS's published discovery document (their `openid-configuration` is the one that exists;
 * `oauth-authorization-server` 404s) over our fallback so required RFC 8414 fields are always present.
 */
export function mergeAuthorizationServerMetadata(
  clientId: string,
  upstream: Record<string, unknown> | null,
): AuthorizationServerMetadata {
  const base = fallbackAuthorizationServerMetadata(clientId);
  if (!upstream || typeof upstream !== 'object') return base;
  const merged: AuthorizationServerMetadata = {
    ...base,
    ...(upstream as Partial<AuthorizationServerMetadata>),
  };
  for (const key of Object.keys(
    base,
  ) as (keyof AuthorizationServerMetadata)[]) {
    if (merged[key] === undefined || merged[key] === null)
      (merged as Record<string, unknown>)[key as string] = base[key];
  }
  return merged;
}

export function wwwAuthenticate(origin: string): string {
  const base = origin.replace(/\/$/, '');
  return `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", scope="openid profile email"`;
}

/** Public origin of this API as the host sees it (honours reverse-proxy headers; PUBLIC_API_URL wins). */
export function requestOrigin(req: {
  headers: Record<string, unknown>;
  protocol?: string;
}): string {
  const fixed = process.env.PUBLIC_API_URL ?? process.env.MCP_PUBLIC_URL;
  if (fixed) return fixed.replace(/\/$/, '');
  const h = req.headers;
  const first = (v: unknown) =>
    typeof v === 'string'
      ? v.split(',')[0].trim()
      : Array.isArray(v)
        ? String(v[0])
        : undefined;
  const proto = first(h['x-forwarded-proto']) ?? req.protocol ?? 'http';
  const host =
    first(h['x-forwarded-host']) ??
    first(h['host']) ??
    `localhost:${process.env.PORT ?? 4000}`;
  return `${proto}://${host}`;
}
