import { getSignInUrl } from "@workos-inc/authkit-nextjs"
import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { authProvider, oidcAuthorizeUrl } from "@/lib/auth-provider"
import { redirectUri } from "@/lib/env"

export const PKCE_COOKIE = "activate-pkce"

/**
 * Starts sign-in. WorkOS mode: hosted AuthKit / SSO (also the WorkOS "initiate login URI" for
 * invitations and resets). OIDC mode: Activate's own authorize endpoint with PKCE; the verifier
 * and state wait in a short-lived HttpOnly cookie for /callback.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  if (authProvider() === "oidc") {
    const verifier = randomBytes(48).toString("base64url")
    const state = randomBytes(16).toString("base64url")
    const next = sp.get("next") ?? "/"
    const jar = await cookies()
    jar.set(PKCE_COOKIE, JSON.stringify({ verifier, state, next: next.startsWith("/") ? next : "/" }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    })
    redirect(
      oidcAuthorizeUrl({
        state,
        codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
        loginHint: sp.get("login_hint") ?? undefined,
      }),
    )
  }
  const url = await getSignInUrl({
    organizationId: sp.get("organization_id") ?? undefined,
    loginHint: sp.get("login_hint") ?? undefined,
    redirectUri: redirectUri(),
  })
  redirect(url)
}
