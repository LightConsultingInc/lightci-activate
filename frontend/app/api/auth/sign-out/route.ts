import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Ends the Activate session locally: clears the sealed AuthKit cookie and lands on
 * our login page. (WorkOS's hosted logout would bounce to the environment's default
 * logout URL, which we don't control in the shared test environment.)
 */
export async function GET(request: NextRequest) {
  const jar = await cookies()
  jar.delete("wos-session")
  jar.delete("activate_org")
  return NextResponse.redirect(new URL("/login", request.url))
}
export const POST = GET
