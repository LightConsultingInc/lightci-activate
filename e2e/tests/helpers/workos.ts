import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { APIRequestContext } from "@playwright/test"
import { PASSWORD } from "./users"

/** Minimal dotenv reader for api/.env (no dependency): KEY=value lines, `#` comments, optional quotes. */
export function readApiEnv(): Record<string, string> {
  const file = process.env.API_ENV_FILE ?? fileURLToPath(new URL("../../../api/.env", import.meta.url))
  const out: Record<string, string> = {}
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    const hash = value.indexOf(" #")
    if (hash >= 0) value = value.slice(0, hash).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    out[key] = value
  }
  return out
}

/**
 * WorkOS password grant for a seeded demo user. Uses the API's client id and API key (the client
 * secret) from api/.env so the MCP spec can authenticate without a browser.
 */
export async function workosPasswordToken(request: APIRequestContext, email: string, password = PASSWORD): Promise<string> {
  const env = readApiEnv()
  const clientId = env.WORKOS_CLIENT_ID
  const clientSecret = env.WORKOS_CLIENT_SECRET ?? env.WORKOS_API_KEY
  if (!clientId || !clientSecret) throw new Error("WORKOS_CLIENT_ID / WORKOS_API_KEY missing from api/.env")
  const res = await request.post("https://api.workos.com/user_management/authenticate", {
    data: { client_id: clientId, client_secret: clientSecret, grant_type: "password", email, password },
    timeout: 30_000,
  })
  if (!res.ok()) throw new Error(`WorkOS password grant failed (${res.status()}): ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { access_token?: string }
  if (!body.access_token) throw new Error("WorkOS response had no access_token")
  return body.access_token
}
