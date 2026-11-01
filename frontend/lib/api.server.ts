import "server-only"
import { withAuth } from "@workos-inc/authkit-nextjs"
import { cookies } from "next/headers"
import { registerServerAuth } from "./api"
import { authProvider } from "./auth-provider"
import { getAccessToken } from "./session"

// Side-effect module: wires the current session (AuthKit or Activate's own) into the isomorphic API client for server components.
registerServerAuth(async () => {
  const jar = await cookies()
  const org = jar.get("activate_org")?.value ?? null
  if (authProvider() === "oidc") return { token: await getAccessToken(), org }
  const { accessToken } = await withAuth()
  return { token: accessToken ?? null, org }
})

export {}
