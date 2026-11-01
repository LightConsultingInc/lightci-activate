import "server-only"
import { withAuth } from "@workos-inc/authkit-nextjs"
import { redirect } from "next/navigation"
import { authProvider } from "./auth-provider"
import { getAccessToken } from "./session"

/** Server components call this to insist on a signed-in person, whichever identity mode is in use. */
export async function requireUser() {
  if (authProvider() === "oidc") {
    const token = await getAccessToken()
    if (!token) redirect("/login")
    return { accessToken: token }
  }
  return withAuth({ ensureSignedIn: true })
}

export async function getOptionalUser() {
  if (authProvider() === "oidc") {
    const token = await getAccessToken()
    return { accessToken: token ?? undefined }
  }
  return withAuth()
}
