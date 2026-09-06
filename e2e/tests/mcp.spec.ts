import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test"
import { API_URL } from "./helpers/api"
import { USERS } from "./helpers/users"
import { workosPasswordToken } from "./helpers/workos"

const MCP_URL = `${API_URL}/mcp`
const HEADERS = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" }

type JsonRpc = { jsonrpc: "2.0"; id: number | null; result?: Record<string, unknown>; error?: { code: number; message: string } }

/** The server may answer JSON or an SSE stream; in the latter case the payload is the last `data:` line. */
async function rpcBody(res: APIResponse): Promise<JsonRpc> {
  const type = res.headers()["content-type"] ?? ""
  const text = await res.text()
  if (type.includes("text/event-stream")) {
    const data = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim())
    if (!data.length) throw new Error(`SSE body had no data lines: ${text.slice(0, 200)}`)
    return JSON.parse(data[data.length - 1]) as JsonRpc
  }
  return JSON.parse(text) as JsonRpc
}

async function rpc(request: APIRequestContext, token: string | null, id: number, method: string, params: Record<string, unknown> = {}) {
  const res = await request.post(MCP_URL, {
    headers: { ...HEADERS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    data: { jsonrpc: "2.0", id, method, params },
  })
  return { res, body: res.status() === 200 ? await rpcBody(res) : ((await res.json()) as JsonRpc) }
}

/** Request-level MCP checks (no browser): Streamable HTTP at /mcp with a WorkOS bearer for Priya Nair. */
test.describe("mcp server", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  let token = ""
  test.beforeAll(async ({ request }) => {
    token = await workosPasswordToken(request, USERS.learner.email)
  })

  test("initialize negotiates the protocol and advertises tools + resources", async ({ request }) => {
    const { res, body } = await rpc(request, token, 1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1.0" } })
    expect(res.status()).toBe(200)
    expect(body.error).toBeUndefined()
    expect(body.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "lightci-activate" } })
    expect(body.result!.capabilities).toHaveProperty("tools")
    expect(body.result!.capabilities).toHaveProperty("resources")
    expect(String(body.result!.instructions)).toMatch(/my_ladder/)
  })

  test("tools/list includes my_ladder and activate_api", async ({ request }) => {
    const { res, body } = await rpc(request, token, 2, "tools/list")
    expect(res.status()).toBe(200)
    const tools = (body.result!.tools as { name: string; description?: string; inputSchema?: unknown }[]).map((t) => t.name)
    expect(tools).toEqual(expect.arrayContaining(["my_ladder", "library", "skill_detail", "submit_skill", "submit_artifact", "map_workflow", "team", "org", "promotion_queue", "activate_api"]))
    for (const t of body.result!.tools as { inputSchema?: unknown }[]) expect(t.inputSchema).toBeTruthy()
  })

  test("tools/call my_ladder returns text mentioning the rung and structured content", async ({ request }) => {
    const { res, body } = await rpc(request, token, 3, "tools/call", { name: "my_ladder", arguments: {} })
    expect(res.status()).toBe(200)
    expect(body.error).toBeUndefined()
    const content = body.result!.content as { type: string; text?: string }[]
    const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n")
    expect(text).toMatch(/\bL[0-5]\b/)
    expect(text).toMatch(/Next up|top of the ladder|revisit/i)
    const structured = body.result!.structuredContent as { tool: string; data: { rung: number; person: { name: string } } }
    expect(structured.tool).toBe("my_ladder")
    expect(structured.data.person.name).toBe(USERS.learner.name)
    expect(text).toContain(`L${structured.data.rung}`)
  })

  test("resources/read ui://activate/app.html returns the MCP App HTML", async ({ request }) => {
    const { res, body } = await rpc(request, token, 4, "resources/read", { uri: "ui://activate/app.html" })
    expect(res.status()).toBe(200)
    const contents = body.result!.contents as { uri: string; mimeType: string; text: string }[]
    expect(contents[0].uri).toBe("ui://activate/app.html")
    expect(contents[0].mimeType).toMatch(/^text\/html/)
    expect(contents[0].text.trim().toLowerCase()).toMatch(/^<!doctype html>/)
    expect(contents[0].text).toMatch(/<title>Activate<\/title>/)
  })

  test("unauthenticated requests get 401 with an RFC 9728 WWW-Authenticate hint", async ({ request }) => {
    const { res, body } = await rpc(request, null, 5, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1.0" } })
    expect(res.status()).toBe(401)
    const www = res.headers()["www-authenticate"]
    expect(www).toMatch(/^Bearer /)
    expect(www).toContain(`resource_metadata="${API_URL}/.well-known/oauth-protected-resource"`)
    expect(body.error?.message).toMatch(/Unauthorized/)
  })

  test("a bad bearer is rejected the same way", async ({ request }) => {
    const { res } = await rpc(request, "not-a-real-token", 6, "tools/list")
    expect(res.status()).toBe(401)
    expect(res.headers()["www-authenticate"]).toMatch(/resource_metadata=/)
  })

  test("/.well-known/oauth-protected-resource points at WorkOS", async ({ request }) => {
    const res = await request.get(`${API_URL}/.well-known/oauth-protected-resource`)
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { resource: string; authorization_servers: string[]; bearer_methods_supported: string[] }
    expect(body.resource).toBe(MCP_URL)
    expect(Array.isArray(body.authorization_servers)).toBeTruthy()
    expect(body.authorization_servers.length).toBeGreaterThan(0)
    expect(body.authorization_servers[0]).toMatch(/^https:\/\/api\.workos\.com\/user_management\//)
    expect(body.bearer_methods_supported).toContain("header")
    const alias = await request.get(`${API_URL}/.well-known/oauth-protected-resource/mcp`)
    expect(alias.status()).toBe(200)
  })
})
