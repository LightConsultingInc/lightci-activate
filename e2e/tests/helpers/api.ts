import { expect, type APIRequestContext, type Page } from "@playwright/test"

/** REST base for direct API assertions (the web app proxies nothing; the browser talks to it directly). */
export const API_URL = process.env.API_URL ?? "http://localhost:4310"

/**
 * WorkOS access token for the signed-in role. The Next.js route `/auth/token` reads the sealed
 * AuthKit cookie from the storage state and hands back the bearer the browser itself uses.
 */
export async function accessToken(ctx: APIRequestContext | Page): Promise<string> {
  const request = "request" in ctx ? ctx.request : ctx
  const res = await request.get("/auth/token")
  expect(res.ok(), `GET /auth/token → ${res.status()}`).toBeTruthy()
  const { accessToken } = (await res.json()) as { accessToken: string | null }
  if (!accessToken) throw new Error("No access token in storage state; re-run the setup project")
  return accessToken
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/** Small typed wrapper over the REST API for setup/teardown and cross-checks. Throws on non-2xx. */
export async function api<T = unknown>(ctx: APIRequestContext | Page, method: Method, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const request = "request" in ctx ? ctx.request : ctx
  const token = await accessToken(ctx)
  const res = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extraHeaders },
    data: body === undefined ? undefined : JSON.stringify(body),
    timeout: 60_000,
  })
  const text = await res.text()
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : null) as T
}
