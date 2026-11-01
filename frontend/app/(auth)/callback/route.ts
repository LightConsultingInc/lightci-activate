import { getWorkOS, handleAuth, saveSession } from "@workos-inc/authkit-nextjs"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { authProvider, oidcExchangeCode } from "@/lib/auth-provider"
import { webUrl } from "@/lib/env"
import { saveTokens } from "@/lib/session"
import { PKCE_COOKIE } from "../sign-in/route"

function publicBase(): string {
  return webUrl()
}

const handler = handleAuth({
  returnPathname: "/",
  baseURL: publicBase(),
  onError: ({ request }) => NextResponse.redirect(new URL("/login?authError=1", publicBase() ?? request.url)),
})

/**
 * Sign-in callback.
 * OIDC mode: verify state against the PKCE cookie, exchange the code at Activate's token endpoint,
 * seal the tokens into the session cookie.
 * WorkOS mode: in-app sign-ins carry PKCE state and use the stock AuthKit handler; flows that
 * start on the hosted AuthKit page (password reset, invitations) arrive with only a `code`.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  if (authProvider() === "oidc") {
    const jar = await cookies()
    const raw = jar.get(PKCE_COOKIE)?.value
    jar.delete(PKCE_COOKIE)
    const error = request.nextUrl.searchParams.get("error")
    if (error) return NextResponse.redirect(new URL(`/login?authError=1&reason=${encodeURIComponent(error)}`, publicBase()))
    let pending: { verifier: string; state: string; next: string } | null = null
    try {
      pending = raw ? (JSON.parse(raw) as { verifier: string; state: string; next: string }) : null
    } catch {
      pending = null
    }
    if (!code || !state || !pending || pending.state !== state) return NextResponse.redirect(new URL("/login?authError=1", publicBase()))
    try {
      const tokens = await oidcExchangeCode(code, pending.verifier)
      await saveTokens(tokens)
      return NextResponse.redirect(new URL(pending.next || "/", publicBase()))
    } catch {
      return NextResponse.redirect(new URL("/login?authError=1", publicBase()))
    }
  }
  if (code && !state) {
    try {
      const auth = await getWorkOS().userManagement.authenticateWithCode({ clientId: process.env.WORKOS_CLIENT_ID as string, code })
      const response = NextResponse.redirect(new URL("/", publicBase() ?? request.url))
      await saveSession(auth, request)
      return response
    } catch {
      return NextResponse.redirect(new URL("/login?authError=1", publicBase() ?? request.url))
    }
  }
  return handler(request)
}
