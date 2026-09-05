import "server-only"
import { withAuth } from "@workos-inc/authkit-nextjs"

export async function requireUser() {
  return withAuth({ ensureSignedIn: true })
}

export async function getOptionalUser() {
  return withAuth()
}
