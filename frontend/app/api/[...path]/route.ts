import type { NextRequest } from "next/server"
import { apiUrl } from "@/lib/env"

/**
 * Same-origin proxy for the browser: `/api/*` on the web host forwards to the Activate API
 * configured at runtime (API_URL). The browser therefore never needs to know the API's
 * address, no CORS is involved, and one web image serves every deployment. Next's own
 * handlers (`/api/health`, `/api/auth/sign-out`) are more specific and take precedence.
 */
export const dynamic = "force-dynamic"

const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate", "host", "content-length"])

async function forward(request: NextRequest, params: Promise<{ path: string[] }>): Promise<Response> {
  const { path } = await params
  const target = new URL(`${apiUrl()}/api/${path.map(encodeURIComponent).join("/")}`)
  target.search = request.nextUrl.search

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value)
  })
  const forwardedFor = request.headers.get("x-forwarded-for")
  const clientIp = forwardedFor?.split(",")[0]?.trim()
  if (clientIp) headers.set("x-forwarded-for", clientIp)

  const hasBody = !["GET", "HEAD"].includes(request.method)
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    // Node's fetch needs this to stream a request body.
    ...(hasBody ? ({ duplex: "half" } as Record<string, unknown>) : {}),
    redirect: "manual",
    cache: "no-store",
  })

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "content-encoding") responseHeaders.set(key, value)
  })
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders })
}

type Ctx = { params: Promise<{ path: string[] }> }
export const GET = (request: NextRequest, ctx: Ctx) => forward(request, ctx.params)
export const POST = (request: NextRequest, ctx: Ctx) => forward(request, ctx.params)
export const PUT = (request: NextRequest, ctx: Ctx) => forward(request, ctx.params)
export const PATCH = (request: NextRequest, ctx: Ctx) => forward(request, ctx.params)
export const DELETE = (request: NextRequest, ctx: Ctx) => forward(request, ctx.params)
export const HEAD = (request: NextRequest, ctx: Ctx) => forward(request, ctx.params)
