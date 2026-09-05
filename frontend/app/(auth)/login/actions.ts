"use server"

import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs"

export type SignInResult = { ok: true } | { ok: false; error: string }

/** Email + password sign-in through WorkOS User Management (no redirect needed). */
export async function signInWithPassword(_prev: SignInResult | null, formData: FormData): Promise<SignInResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  if (!email || !password) return { ok: false, error: "Email and password are required." }
  const clientId = process.env.WORKOS_CLIENT_ID
  if (!clientId) return { ok: false, error: "WORKOS_CLIENT_ID is not configured." }
  try {
    const auth = await getWorkOS().userManagement.authenticateWithPassword({ clientId, email, password })
    const origin = new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "http://localhost:3000/callback").origin
    await saveSession(auth, origin)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed."
    return { ok: false, error: /password|credential|invalid/i.test(message) ? "That email and password did not match." : message }
  }
}
