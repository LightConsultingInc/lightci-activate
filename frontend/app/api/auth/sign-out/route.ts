import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import { authProvider } from "@/lib/auth-provider"
import { clearSession } from "@/lib/session"

/**
 * Ends the Activate session locally and lands on our login page. OIDC mode also revokes the
 * refresh token at the API. (WorkOS's hosted logout would bounce to the environment's default
 * logout URL, which we don't control in the shared test environment.)
 */
export async function GET(request: NextRequest) {
  const jar = await cookies()
  if (authProvider() === "oidc") await clearSession()
  jar.delete("wos-session")
  jar.delete("activate_org")
  return NextResponse.redirect(new URL("/login", request.url))
}
export const POST = GET
