import { getWorkOS, withAuth } from "@workos-inc/authkit-nextjs"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { authProvider } from "@/lib/auth-provider"
import { publicUrl } from "@/lib/env"
import { clearSession } from "@/lib/session"

/**
 * Ends the Activate session locally and lands on our login page (with `reason=sso|setup` when the
 * company's sign-in policy refused the session, so the page can say why). OIDC mode also revokes the
 * refresh token at the API. WorkOS mode revokes the session at WorkOS without its hosted logout page (which would
 * bounce to the environment's default logout URL).
 */
export async function GET(request: NextRequest) {
  const jar = await cookies()
  if (authProvider() === "oidc") await clearSession()
  else {
    // End the session at WorkOS too. Otherwise the next sign-in silently reuses it: Sign out would not
    // really sign out, and a session the company's policy refused would keep coming back.
    try {
      const { sessionId } = await withAuth()
      if (sessionId) await getWorkOS().userManagement.revokeSession({ sessionId })
    } catch {
      /* already gone or never signed in: nothing to revoke */
    }
  }
  jar.delete("wos-session")
  jar.delete("activate_org")
  // A session the company's sign-in policy refused: say why on the login page (whitelisted reasons only).
  const reason = request.nextUrl.searchParams.get("reason")
  const query = reason === "sso" || reason === "setup" || reason === "deactivated" ? `?authError=${reason}` : ""
  return NextResponse.redirect(publicUrl(`/login${query}`))
}
export const POST = GET
