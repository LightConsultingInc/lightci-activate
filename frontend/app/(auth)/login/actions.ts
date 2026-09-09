"use server"

import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs"

export type OrgChoice = { id: string; name: string }
export type SignInResult =
  | { ok: true }
  | { ok: false; error: string }
  /** The account belongs to more than one organisation: WorkOS needs to know which one to open. */
  | { ok: false; chooseOrg: { pendingToken: string; organizations: OrgChoice[] } }

const origin = () => new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "http://localhost:3000/callback").origin

function friendly(err: unknown): string {
  const message = err instanceof Error ? err.message : "Sign-in failed."
  return /password|credential|invalid/i.test(message) ? "That email and password did not match." : message
}

/** Email + password sign-in through WorkOS User Management (no redirect needed). */
export async function signInWithPassword(_prev: SignInResult | null, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  if (!email || !password) return { ok: false, error: "Email and password are required." }
  const clientId = process.env.WORKOS_CLIENT_ID
  if (!clientId) return { ok: false, error: "WORKOS_CLIENT_ID is not configured." }
  try {
    const auth = await getWorkOS().userManagement.authenticateWithPassword({ clientId, email, password })
    await saveSession(auth, origin())
    return { ok: true }
  } catch (err) {
    // Accounts in several organisations get a second step instead of an error.
    const e = err as { code?: string; pendingAuthenticationToken?: string; rawData?: { organizations?: { id: string; name: string }[] } }
    if (e?.code === "organization_selection_required" && e.pendingAuthenticationToken) {
      const organizations = (e.rawData?.organizations ?? []).map((o) => ({ id: o.id, name: o.name }))
      return { ok: false, chooseOrg: { pendingToken: e.pendingAuthenticationToken, organizations } }
    }
    return { ok: false, error: friendly(err) }
  }
}

/** Second step for accounts in several organisations: finish sign-in for the one they picked. */
export async function signInWithOrganization(_prev: SignInResult | null, formData: FormData): Promise<SignInResult> {
  const pendingAuthenticationToken = String(formData.get("pendingToken") ?? "")
  const organizationId = String(formData.get("organizationId") ?? "")
  const clientId = process.env.WORKOS_CLIENT_ID
  if (!clientId) return { ok: false, error: "WORKOS_CLIENT_ID is not configured." }
  if (!pendingAuthenticationToken || !organizationId) return { ok: false, error: "Pick an organisation to continue." }
  try {
    const auth = await getWorkOS().userManagement.authenticateWithOrganizationSelection({ clientId, pendingAuthenticationToken, organizationId })
    await saveSession(auth, origin())
    return { ok: true }
  } catch (err) {
    return { ok: false, error: friendly(err) }
  }
}
