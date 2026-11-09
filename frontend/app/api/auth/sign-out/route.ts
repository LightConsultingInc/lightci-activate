import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { authProvider } from "@/lib/auth-provider"
import { clearSession } from "@/lib/session"

/**
 * Ends the Activate session locally and lands on our login page (with `reason=sso|setup` when the
 * company's sign-in policy refused the session, so the page can say why). OIDC mode also revokes the
 * refresh token at the API. (WorkOS's hosted logout would bounce to the environment's default
 * logout URL, which we don't control in the shared test environment.)
 */
export async function GET(request: NextRequest) {
  const jar = await cookies()
  if (authProvider() === "oidc") await clearSession()
  jar.delete("wos-session")
  jar.delete("activate_org")
  // A session the company's sign-in policy refused: say why on the login page (whitelisted reasons only).
  const reason = request.nextUrl.searchParams.get("reason")
  const query = reason === "sso" || reason === "setup" ? `?authError=${reason}` : ""
  return NextResponse.redirect(new URL(`/login${query}`, request.url))
}
export const POST = GET
