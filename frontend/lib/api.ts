/**
 * API client. On the server we read the WorkOS access token from the AuthKit
 * session; in the browser we fetch it once from /auth/token and cache until
 * near expiry. Every call is scoped to the org the person belongs to; LightCI
 * leads can switch orgs with the `activate_org` cookie (sent as X-Activate-Org).
 */
export const API_URL = (typeof window === "undefined" ? process.env.API_URL : process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:4310"

export class ApiError extends Error {
  constructor(public status: number, public title: string, public detail: string) {
    super(detail || title)
  }
}

let tokenCache: { token: string | null; expiresAt: number } | null = null

function jwtExpiryMs(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number }
    return payload.exp ? payload.exp * 1000 : Date.now() + 60_000
  } catch {
    return Date.now() + 60_000
  }
}

export function invalidateToken() {
  tokenCache = null
}

async function browserToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 30_000) return tokenCache.token
  try {
    const res = await fetch("/auth/token", { cache: "no-store" })
    if (!res.ok) throw new Error(String(res.status))
    const { accessToken } = (await res.json()) as { accessToken: string | null }
    tokenCache = { token: accessToken, expiresAt: accessToken ? jwtExpiryMs(accessToken) : Date.now() + 60_000 }
    return accessToken
  } catch {
    return null
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

type ServerAuth = () => Promise<{ token: string | null; org: string | null }>
let serverAuthImpl: ServerAuth | null = null

/** Registered by `lib/api.server.ts` (server-only) so this module never imports server code. */
export function registerServerAuth(fn: ServerAuth) {
  serverAuthImpl = fn
}

async function serverAuth(): Promise<{ token: string | null; org: string | null }> {
  if (!serverAuthImpl) throw new Error("Server auth not registered: import '@/lib/api.server' in the server layout before calling the API.")
  return serverAuthImpl()
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isServer = typeof window === "undefined"
  const { token, org } = isServer ? await serverAuth() : { token: await browserToken(), org: readCookie("activate_org") }
  const headers = new Headers(init.headers)
  const isForm = init.body instanceof FormData
  if (!isForm && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  if (token) headers.set("Authorization", `Bearer ${token}`)
  if (org && !headers.has("X-Activate-Org")) headers.set("X-Activate-Org", org)

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" })
  if (!res.ok) {
    let title = res.statusText
    let detail = ""
    try {
      const body = (await res.json()) as { title?: string; detail?: string; message?: string }
      title = body.title ?? title
      detail = body.detail ?? body.message ?? ""
    } catch {
      detail = await res.text().catch(() => "")
    }
    throw new ApiError(res.status, title, detail || `${path} failed (${res.status})`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
}

/** Shape of GET /api/auth/me. */
export type Me = {
  user: {
    id: string
    email: string
    name: string
    title: string | null
    avatarUrl: string | null
    roles: ("learner" | "champion" | "sponsor" | "admin" | "lead")[]
    orgId: string | null
    teamId: string | null
    consentAt: string | null
    onboardedAt: string | null
    rung: number
    rungLabel: string
  } | null
  org: { id: string; name: string; slug: string; isDemo: boolean; settings: Record<string, unknown> } | null
  team: { id: string; name: string; slug: string } | null
  orgs: { id: string; name: string; slug: string }[]
}

export const getMe = () => api.get<Me>("/api/auth/me")
