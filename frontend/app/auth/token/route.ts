import { withAuth } from "@workos-inc/authkit-nextjs"
import { NextResponse } from "next/server"
import { authProvider } from "@/lib/auth-provider"
import { getAccessToken } from "@/lib/session"

/** Hands the current access token to client components so they can call the API (through the same-origin proxy). */
export async function GET() {
  const headers = { "Cache-Control": "no-store" }
  if (authProvider() === "oidc") return NextResponse.json({ accessToken: await getAccessToken() }, { headers })
  const { accessToken } = await withAuth()
  return NextResponse.json({ accessToken: accessToken ?? null }, { headers })
}
