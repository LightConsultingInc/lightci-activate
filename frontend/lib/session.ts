import "server-only"
import { getIronSession, type SessionOptions } from "iron-session"
import { cookies } from "next/headers"
import { apiUrl } from "./env"

/**
 * The web app's own session in OIDC mode: Activate-issued tokens sealed into an HttpOnly
 * cookie. (In WorkOS mode AuthKit owns the session cookie instead; see lib/auth-provider.ts.)
 */
export const SESSION_COOKIE = "activate-session"
const WEB_CLIENT_ID = process.env.AUTH_WEB_CLIENT_ID ?? "activate-web"
const REFRESH_AHEAD_MS = 60_000

export interface ActivateSession {
  accessToken?: string
  refreshToken?: string
  /** Epoch milliseconds when the access token expires. */
  expiresAt?: number
}

function options(): SessionOptions {
  const password = process.env.SESSION_SECRET ?? process.env.WORKOS_COOKIE_PASSWORD
  if (!password || password.length < 32) throw new Error("SESSION_SECRET (32+ characters) is required for the web session")
  return {
    cookieName: SESSION_COOKIE,
    password,
    ttl: 30 * 24 * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  }
}

export async function getSession() {
  return getIronSession<ActivateSession>(await cookies(), options())
}

export async function saveTokens(tokens: { access_token: string; refresh_token?: string; expires_in: number }) {
  const session = await getSession()
  session.accessToken = tokens.access_token
  if (tokens.refresh_token) session.refreshToken = tokens.refresh_token
  session.expiresAt = Date.now() + tokens.expires_in * 1000
  await session.save()
}

export async function clearSession() {
  const session = await getSession()
  const refreshToken = session.refreshToken
  session.destroy()
  if (refreshToken) {
    // Best effort: tell the API the refresh token is done with.
    await fetch(`${apiUrl()}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken, client_id: WEB_CLIENT_ID }).toString(),
      cache: "no-store",
    }).catch(() => undefined)
  }
}

/**
 * The current access token, refreshed through the API when it is about to expire.
 * Null when there is no session or the refresh was refused (the person must sign in again).
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession()
  if (!session.accessToken) return null
  if ((session.expiresAt ?? 0) - Date.now() > REFRESH_AHEAD_MS) return session.accessToken
  if (!session.refreshToken) return null
  const res = await fetch(`${apiUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken, client_id: WEB_CLIENT_ID }).toString(),
    cache: "no-store",
  }).catch(() => null)
  if (!res?.ok) {
    session.destroy()
    return null
  }
  const tokens = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  session.accessToken = tokens.access_token
  if (tokens.refresh_token) session.refreshToken = tokens.refresh_token
  session.expiresAt = Date.now() + tokens.expires_in * 1000
  await session.save()
  return session.accessToken
}
