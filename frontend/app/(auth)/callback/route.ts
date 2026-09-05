import { getWorkOS, handleAuth, saveSession } from "@workos-inc/authkit-nextjs"
import { NextResponse, type NextRequest } from "next/server"

function publicBase(): string | undefined {
  try {
    return new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "").origin
  } catch {
    return undefined
  }
}

const handler = handleAuth({
  returnPathname: "/",
  baseURL: publicBase(),
  onError: ({ request }) => NextResponse.redirect(new URL("/login?authError=1", publicBase() ?? request.url)),
})

/**
 * AuthKit callback. In-app sign-ins carry PKCE state and use the stock handler.
 * Flows that start on the hosted AuthKit page (password reset, invitations) arrive
 * with only a `code`; exchange it directly so users never see a raw error.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
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
