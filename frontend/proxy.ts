import { authkitMiddleware } from "@workos-inc/authkit-nextjs"
import type { NextFetchEvent, NextRequest } from "next/server"
import { NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/sign-in", "/callback", "/api/auth/sign-out", "/auth/token", "/brand"]

const authkit = authkitMiddleware({
  middlewareAuth: { enabled: false, unauthenticatedPaths: PUBLIC_PATHS },
})

/**
 * Next 16 "proxy" (formerly middleware). AuthKit keeps the session cookie fresh;
 * we gate routes ourselves so signed-out visitors land on our login page (password
 * or SSO) rather than the hosted AuthKit screen.
 */
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl
  if (request.headers.has("next-action") && pathname === "/login") return NextResponse.next()
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  if (!isPublic && !request.cookies.get("wos-session")) {
    const url = new URL("/login", request.url)
    if (pathname !== "/") url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }
  return authkit(request, event)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|\\.well-known|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
}
