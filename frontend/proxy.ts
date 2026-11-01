import { authkitMiddleware } from "@workos-inc/authkit-nextjs"
import type { NextFetchEvent, NextRequest } from "next/server"
import { NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/sign-in", "/callback", "/api/auth/sign-out", "/api/health", "/auth/token", "/brand"]

const isOidc = process.env.AUTH_PROVIDER === "oidc"
const SESSION_COOKIE = isOidc ? "activate-session" : "wos-session"

// AuthKit's middleware needs WorkOS configuration; it is only built in WorkOS mode.
const authkit = isOidc
  ? null
  : authkitMiddleware({
      middlewareAuth: { enabled: false, unauthenticatedPaths: PUBLIC_PATHS },
    })

/**
 * Next 16 "proxy" (formerly middleware). In WorkOS mode AuthKit keeps the session cookie fresh;
 * in OIDC mode the sealed `activate-session` cookie is ours. Either way we gate routes ourselves
 * so signed-out visitors land on our login page rather than a hosted screen.
 */
export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl
  if (request.headers.has("next-action") && pathname === "/login") return NextResponse.next()
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  if (!isPublic && !request.cookies.get(SESSION_COOKIE)) {
    // Browser API calls through the same-origin proxy get a plain 401, not a login page.
    if (pathname.startsWith("/api/")) return NextResponse.json({ status: 401, title: "Unauthorized", detail: "Sign in required" }, { status: 401 })
    const url = new URL("/login", request.url)
    if (pathname !== "/") url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }
  return authkit ? authkit(request, event) : NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|\\.well-known|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
}
