import { getSignInUrl } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
import type { NextRequest } from "next/server"

/** Starts hosted AuthKit / SSO. Also the WorkOS "initiate login URI" for invitations and resets. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const url = await getSignInUrl({
    organizationId: sp.get("organization_id") ?? undefined,
    loginHint: sp.get("login_hint") ?? undefined,
    redirectUri: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  })
  redirect(url)
}
