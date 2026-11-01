import "server-only"
import { apiUrl, publicApiUrl, webUrl } from "./env"

/**
 * Which identity mode this deployment runs in. Mirrors the API's AUTH_PROVIDER:
 *   workos  AuthKit cookie (`wos-session`), hosted AuthKit and password sign-in (cloud default)
 *   oidc    the customer's own IdP behind Activate's OAuth server; sealed `activate-session` cookie
 */
export type AuthProvider = "workos" | "oidc"

export function authProvider(): AuthProvider {
  return process.env.AUTH_PROVIDER === "oidc" ? "oidc" : "workos"
}

export const WEB_CLIENT_ID = process.env.AUTH_WEB_CLIENT_ID ?? "activate-web"

/** Where the web app sends people to sign in (OIDC mode): Activate's own authorize endpoint. */
export function oidcAuthorizeUrl(params: { state: string; codeChallenge: string; loginHint?: string }): string {
  const u = new URL(`${publicApiUrl()}/oauth/authorize`)
  u.searchParams.set("response_type", "code")
  u.searchParams.set("client_id", WEB_CLIENT_ID)
  u.searchParams.set("redirect_uri", `${webUrl()}/callback`)
  u.searchParams.set("scope", "openid profile email offline_access")
  u.searchParams.set("state", params.state)
  u.searchParams.set("code_challenge", params.codeChallenge)
  u.searchParams.set("code_challenge_method", "S256")
  if (params.loginHint) u.searchParams.set("login_hint", params.loginHint)
  return u.toString()
}

/** Exchange the code at Activate's token endpoint. Throws on a non-2xx response. */
export async function oidcExchangeCode(code: string, codeVerifier: string) {
  const res = await fetch(`${apiUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${webUrl()}/callback`,
      code_verifier: codeVerifier,
      client_id: WEB_CLIENT_ID,
    }).toString(),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
}
