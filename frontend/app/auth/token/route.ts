import { withAuth } from "@workos-inc/authkit-nextjs"
import { NextResponse } from "next/server"

/** Hands the WorkOS access token to client components so they can call the API directly. */
export async function GET() {
  const { accessToken } = await withAuth()
  return NextResponse.json({ accessToken: accessToken ?? null }, { headers: { "Cache-Control": "no-store" } })
}
