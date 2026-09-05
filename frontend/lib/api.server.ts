import "server-only"
import { withAuth } from "@workos-inc/authkit-nextjs"
import { cookies } from "next/headers"
import { registerServerAuth } from "./api"

// Side-effect module: wires the AuthKit session into the isomorphic API client for server components.
registerServerAuth(async () => {
  const [{ accessToken }, jar] = await Promise.all([withAuth(), cookies()])
  return { token: accessToken ?? null, org: jar.get("activate_org")?.value ?? null }
})

export {}
