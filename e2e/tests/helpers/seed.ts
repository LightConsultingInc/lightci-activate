import { expect, type APIRequestContext } from "@playwright/test"
import { accessToken, API_URL } from "./api"

export type SeedResetResult = { ok: true; truncated: number; tables: string[] }

/**
 * Truncates every entity table and reseeds the Meridian demo org. The caller's request context must
 * carry an admin storage state (Elena Marsh is sponsor + admin). Takes a few seconds; every id in the
 * database changes, so tests must discover ids at runtime rather than hard-code them.
 */
export async function resetSeed(request: APIRequestContext): Promise<SeedResetResult> {
  const token = await accessToken(request)
  const res = await request.post(`${API_URL}/api/admin/seed/reset`, { headers: { Authorization: `Bearer ${token}` }, timeout: 120_000 })
  expect(res.ok(), `seed reset → ${res.status()} ${await res.text()}`).toBeTruthy()
  return (await res.json()) as SeedResetResult
}
